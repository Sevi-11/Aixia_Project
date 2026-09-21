# Aixia — Project Documentation

**A personal retrieval-augmented generation chatbot.** Technical and non-technical reference.

| | |
|---|---|
| **Author** | Vince Viñas |
| **Live** | https://aixia-project.vercel.app |
| **Backend** | https://aixia-backend.onrender.com |
| **Stack** | Next.js · Django REST Framework · LangChain · pgvector · Groq · Gemini |
| **Hosting** | Vercel · Render · Supabase |
| **Version** | 3.0 — 21 September 2026 |
| **Intended use** | Human reference and RAG ingestion corpus |

---

## 1. What Aixia Is

Aixia is a full-stack retrieval-augmented generation (RAG) chatbot that answers questions about Vince Viñas's professional background. It answers from PDFs uploaded to it — a CV and related documents — and shows the source excerpts behind every answer. It is a portfolio project and it is live in production.

Aixia has two chat modes, an animated presence called Xia, and two-way voice. The default mode is grounded: it retrieves, cites, and refuses when the documents do not cover the question.

### Why it exists

A CV is static; a reader cannot ask it a follow-up question. Aixia turns one into something interrogable while keeping every answer anchored to the document rather than to a language model's memory. The project deliberately bridges classical ML and embedded engineering experience with modern LLM application development.

### The core guarantee: grounded, not guessed

**Grounding is the product.** Grounded mode answers only from retrieved context, cites each claim as `[n]`, and says plainly when the context does not cover the question. That refusal is the demonstration, not an edge case — a change that makes answers more fluent at the cost of the refusal is a regression, and `apps/rag/test_e_prompts.py` guards the contract.

A general-purpose chatbot asked about a private individual will confidently fabricate. The visible sources panel is the other half of the promise: a sceptical reader can check any claim without leaving the page.

### How Vince is named

The assistant speaks **about** Vince, always in the third person. It is his assistant, never an impersonation — "I" in an answer refers to the assistant.

- **Vince** / **Vince Viñas** — the default, in conversation and anything user-facing.
- **Sean Vincent Vien V. Viñas** — the full legal name, used only when a formal or legal name is actually asked for.
- **Sean** on its own — never. It is what his family calls him and has no place in a professional or product context.

This rule is stated explicitly in the prompt because the source documents supply the formal name, and without an instruction the retrieved text would decide the register.

### What it deliberately does not do

Aixia has no login for chat; anyone who can reach the page can ask. Only document upload and ingestion require a Django administrator. Conversations are not shared between devices — the chat list lives in that browser's `localStorage`. Only PDFs are accepted, up to 20 MB, and there is no OCR, so a scanned image-only PDF yields little text.

### How RAG works here, briefly

Retrieval-augmented generation means finding the passages relevant to a question and pasting them into the model's prompt, so the model is never asked what it knows — it is asked to answer from supplied text.

An **embedding** is a vector representing meaning, so a search for "machine learning experience" matches "trained a convolutional neural network" despite sharing no words. A **chunk** is a passage cut from a document before indexing, because a whole CV is too coarse a unit to retrieve and too wasteful to paste wholesale.

---

## 2. The Two Modes

The chat exposes two modes, and they deliberately do not share a model.

| | **About Vince** (default) | **General** |
|---|---|---|
| Retrieval | pgvector similarity search | none |
| Sources | cited inline as `[n]` | none, by design |
| Behaviour | refuses when context is insufficient | answers generally; hands Vince questions back to grounded mode |
| Provider | Groq | Gemini Flash |
| Limit | the default `anon` rate | `10/hour` per visitor |

### Why the split

Groq's free tier caps **output** tokens per minute at 1000 for the whole organisation, and rejects a request up front when `max_tokens` exceeds what is left of that ceiling. Grounded answers are short, cited, and the thing the project exists to demonstrate, so they keep that budget to themselves.

Open-ended general chat would drain it in a couple of turns and take the grounded demo down with it — during the hour someone is actually looking. Gemini's free tier trades that per-minute cliff for a per-day request ceiling, which is why general mode carries an additional per-visitor limit in `apps/chat/d_throttles.py`.

### The default is safety, not convenience

**An omitted `mode` always means grounded.** A client that says nothing must never start receiving unsourced answers about a real person. An unknown mode value is rejected outright rather than silently coerced.

General mode also refuses to answer questions about Vince, handing them back to grounded mode instead. A mode that sometimes improvises cannot make the grounding promise, so it does not try.

### Degrading honestly

When the general limit is hit, the assistant says it is at capacity and points at the other mode. This matters more than it sounds: with voice enabled, going quiet is indistinguishable from being broken.

---

## 3. Architecture

### Runtime pieces

- **Next.js frontend** (Vercel) — renders the chat UI and server-side proxies `/api`, `/admin` and `/static` to Django, so the browser never learns the backend's hostname and no backend URL is baked into the browser bundle.
- **Django + DRF backend** (Render, Docker) — the HTTP API, session and message persistence, and the orchestration of retrieval and generation.
- **Supabase Postgres** (`ap-southeast-1`) — one database holding both relational data (documents, sessions, messages) and the `pgvector` embedding rows.
- **Supabase Storage** — S3-protocol object storage for uploaded PDFs.
- **Groq** — grounded answers, follow-up suggestions, conversation titles.
- **Gemini** — embeddings for ingestion and retrieval, and general-mode chat.
- **The browser itself** — speech recognition and speech synthesis. There is no audio backend.

### Two decoupled paths

The Django apps `documents` and `chat` own everything relational. The `backend/apps/rag/` package owns retrieval and generation and imports no Django at all, so it can be tested with fake models and no database.

The two meet in exactly two places: `documents/b_services.py`, which runs a `Document` row through the pipeline, and `chat/b_views.py`, which calls the answering functions.

### File naming convention

The `a_`, `b_`, `c_` prefixes order files by **pipeline position, not by type**: `a_loader` → `b_splitter` → `c_embeddings` → `d_vectorstore` → `e_prompts` → `f_chains` → `g_stream_filter`. A new file takes the letter of its place in the flow.

### Lifecycle: a streamed chat turn

The browser POSTs to `/api/chat/stream/`; Next.js rewrites it to Django. The backend validates the body, resolves or creates a session (verifying a signed token if a session id is claimed), and loads up to the last 20 messages as history.

In grounded mode it embeds the question via Gemini, retrieves the top `RETRIEVAL_K` chunks from pgvector, builds the prompt, and opens a streaming Groq call. In general mode it skips retrieval entirely and streams from Gemini Flash, still emitting an empty `sources` event so one event contract serves both modes.

It returns a `StreamingHttpResponse` of newline-delimited JSON with `Cache-Control: no-cache` and `X-Accel-Buffering: no`. Sources are emitted first, before a single token exists, then tokens as they arrive. The assembled answer is persisted, then suggestions (grounded only) and — on the opening turn — a title, and finally a `done` event carrying the session id and a fresh signed token.

### Lifecycle: ingestion

An administrator uploads a PDF, creating a `Document` row with `is_ingested=false`. Ingestion is a separate, explicit step: read the file through Django's storage API (never `.path`, which raises on S3), load pages with PyMuPDF, split into chunks, stamp each chunk with `document_id` and `original_filename`, embed via Gemini, write to pgvector, and flip `is_ingested`.

It is synchronous — the request stays open for the whole embedding pass.

---

## 4. Technology Stack

- **Frontend** — Next.js 16, React 19, JavaScript. Plain CSS in `app/globals.css` with semantic class names, ported verbatim from the design mockup. Fonts: Abril Fatface, Comfortaa, Inter, IBM Plex Mono. **No UI or Markdown libraries** — the frontend is hand-rolled by policy.
- **Backend** — Django 6.0.7, Django REST Framework 3.17.1, Python 3.12, Gunicorn, WhiteNoise, django-cors-headers, python-dotenv.
- **Database driver** — `psycopg[binary]` 3.x only. Django 6 prefers it when both are present and `langchain-postgres` requires it, so shipping one driver avoids ambiguity.
- **RAG** — langchain, langchain-core, langchain-groq, langchain-text-splitters, langchain-google-genai, langchain-postgres.
- **PDF** — PyMuPDF, called directly.
- **Storage** — `django-storages[s3]` against Supabase Storage.
- **Grounded LLM** — Groq serving `qwen/qwen3.8-27b`, reasoning disabled.
- **General LLM** — Gemini Flash (`gemini-3.6-flash`), thinking budget 0.
- **Embeddings** — Gemini `models/gemini-embedding-001` at 768 dimensions.
- **Speech** — Web Speech API in, `speechSynthesis` out, both client-side.

---

## 5. The RAG Pipeline

### Loading — `rag/a_loader.py`

`load_document(data: bytes, source_name)` opens a PDF from raw bytes with PyMuPDF and returns one LangChain `Document` per page, carrying `source`, `page` (0-based) and `total_pages` metadata.

It takes bytes rather than a path because uploads live in object storage, where `FileField.path` raises `NotImplementedError`; bytes is the one input that works for both local disk and S3. PyMuPDF is called directly rather than through `langchain-community`'s loader because that package is being sunset upstream and was the only thing the project imported from it.

### Splitting — `rag/b_splitter.py`

A `RecursiveCharacterTextSplitter` with separators `["\n\n", "\n", ". ", " ", ""]`, `CHUNK_SIZE` 2000 and `CHUNK_OVERLAP` 250, both overridable by environment variable.

**2000 was measured, not chosen by taste.** Google's embedding quota counts every chunk as one request (100/minute), not every batched call, so halving the chunk count halves the quota cost of ingesting a document. At 2000 the largest real document needs 79 chunks, leaving 21 of headroom. At 1500 the same document needed 102 — over the entire per-minute budget on its own, so no amount of retrying could ever have indexed it. The original 500 (roughly 125 tokens) also split sentences mid-thought, costing retrieval quality as well as quadrupling the request count.

### Embedding — `rag/c_embeddings.py`

`get_embeddings()` returns `GoogleGenerativeAIEmbeddings` for `models/gemini-embedding-001` with `output_dimensionality=768`.

This is a hosted API call rather than a local `sentence-transformers` model, and that is a hosting constraint rather than a preference: the local model pulls in torch, roughly 3 GB of image and several hundred MB resident per worker, more than a free-tier container has. Groq offers no embeddings endpoint, so Gemini is a second provider by necessity.

**Why 768 dimensions.** The model returns 3072 by default, but pgvector's HNSW index refuses anything wider than 2000 — at full width the vectors could be stored but never indexed. Gemini is trained with Matryoshka representation learning, so truncating is supported rather than a lossy hack. Changing this number invalidates every stored vector: embeddings of different widths are not comparable, and the index must be rebuilt from the source PDFs.

### Storing and searching — `rag/d_vectorstore.py`

`PGVector` against the application's own Postgres, collection `aixia_documents`, with `embedding_length=768` and `use_jsonb=True`. Declaring the width makes the column `vector(768)` rather than unconstrained, which is what permits an index; without it searches still work but degrade to a full scan.

`connection_string()` rewrites `DATABASE_URL` from Django's `postgres://` to the `postgresql+psycopg://` form SQLAlchemy needs, so one environment variable serves both rather than two that can drift apart.

**Why pgvector replaced Chroma.** Chroma persisted to a directory on disk — fine locally, quietly broken on a free-tier PaaS box with an ephemeral filesystem. The index would be discarded on every deploy and every wake from sleep with no error to notice; retrieval would simply return nothing. Vectors in Postgres live exactly as long as the database, and one fewer component needs hosting.

### Retrieval depth

`RETRIEVAL_K` defaults to **5** chunks per question, overridable by environment variable, and an explicit `k` argument still wins over both. Four tests in `test_f_chains_retrieval.py` pin that precedence.

### Prompting — `rag/e_prompts.py`

Four templates: `context_prompt` (grounded answers, taking `history`, `context` and `question`), `general_prompt`, `suggestions_prompt`, and `title_prompt`.

The grounded prompt carries several contracts that other code depends on, which is why `test_e_prompts.py` asserts them individually:

- **Naming** — call him Vince; never "Sean" alone; the full legal name stays reachable but is not volunteered; speak about him in the third person.
- **Answer-first** — open with one sentence that answers the question directly.
- **No headings.** Structure comes from prose, lists and tables instead.
- **Structure is required, not permitted** — multiple parallel items *must* be a bulleted list; attribute comparisons *must* be a Markdown table, one row per attribute.
- **Citations** — cite inline as `[1]` immediately after the supported sentence, use only chunk numbers that appear, write `[1][2]` rather than `[1,2]`, and never append a Sources or References list.
- **Redirect rather than dead-end** — on a miss, name one or two subjects the context *does* cover.

**Greetings are not questions.** An early version answered "hi" with the grounding refusal, because nothing in a greeting is in the context either. A recruiter opening with "hello" and being told that is not in what I have on Vince is a bad first impression, so the prompt separates small talk from questions and asks for varied replies rather than one stock greeting.

### Generation — `rag/f_chains.py`

`get_llm(max_tokens, temperature)` builds a `ChatGroq` client; `get_general_llm()` builds the Gemini Flash equivalent. `answer_question()` is the blocking path, `answer_question_stream()` returns retrieved docs immediately plus a lazy generator of visible text, and `answer_general_stream()` is the ungrounded equivalent with no retrieval.

`format_docs()` numbers chunks 1-based in retrieval order. `format_history()` renders turns as `User:` / `Assistant:` lines, or "No previous conversation.". Every answering function accepts an injected `llm` so tests can pass a fake.

**Token budgets exist because Groq's free tier rejects a request up front when `max_tokens` exceeds what is left of the per-minute ceiling.** The answer's real length is irrelevant — what matters is the budget reserved, so an old 4096 ceiling was refused with a 429 before the model ran at all.

| Call | Max tokens | Temperature |
|---|---|---|
| Grounded answer | 700 | 0.2 |
| Follow-up suggestions | 200 | 0.7 |
| Conversation title | 24 | 0.7 |
| General answer | 1200 | 0.7 |

Answers run at 0.2 rather than 0 so that **regenerate can actually produce something different** — at zero it returned the same text every time. Extras run hotter because variety is the point of a suggestion.

`generate_followup_suggestions()` and `generate_title()` are both best-effort and can never raise: they return empty on a failed call, invalid JSON, or non-list JSON, and run after the answer is already persisted, so a failure loses nothing. Title generation additionally strips the quotes, `Title:` prefixes and trailing periods that models add regardless of instruction.

### Reasoning tokens are billed against the output cap

**Both providers do this**, and it is the single most expensive thing to rediscover. `REASONING_EFFORT="none"` for qwen on Groq; `GENERAL_THINKING_BUDGET=0` for Gemini.

Left on, a model spends its allowance thinking and the reply stops mid-sentence with `finish_reason=MAX_TOKENS`. Nothing raises. Nothing logs. Raising a thinking budget means raising the token ceiling with it.

### Stripping reasoning tags — `rag/g_stream_filter.py`

`_strip_thinking()` handles whole strings with two regexes, the second covering an unclosed tag from truncated output. Streaming cannot use a regex, because a tag may be split across token boundaries, so `strip_thinking_stream(chunks)` is a generator holding back the last `len(tag) - 1` characters of each fragment in case they begin a tag whose remainder has not arrived. It tracks an `in_think` flag and whitespace so the trimmed result matches the regex version exactly. If the stream ends inside a block, the unterminated content is discarded.

---

## 6. HTTP API

Grounded chat is throttled by DRF's anonymous rate. General mode carries an additional `general_chat` scope at 10/hour per visitor. Document endpoints require an authenticated Django administrator (`IsAdminUser`).

### `POST /api/documents/upload/`

Multipart, single `file` field. Returns 400 for a missing file, a non-`.pdf` extension, or a file over 20 MB; 201 with the serialized document otherwise.

### `POST /api/documents/<document_id>/ingest/`

No body. 404 if unknown; 200 with "Document already ingested" if the flag is set; 422 if the pipeline raises; otherwise 200 with a `chunks_created` count.

### `POST /api/chat/`

Blocking. Body: `question` (required), optional `session_id` + `session_token`. Returns `session_id`, a fresh `session_token`, the complete `answer`, and a `sources` array. 400 on an empty question, 403 on a bad or missing token for a claimed session, 404 if the signed session no longer exists.

### `GET /api/chat/`

Always 403. Listing history without authentication would let anyone enumerate other people's conversations; this is an acknowledged gap, not an oversight.

### `POST /api/chat/stream/`

The endpoint the frontend actually uses. Same body plus optional `mode` (`grounded` | `general`, defaulting to `grounded`) and `regenerate`. Sessions are validated before streaming begins, so a bad token yields an ordinary 403 rather than a stream containing an error.

Responds `application/x-ndjson`, one complete JSON object per line:

```json
{"type": "sources",     "sources": [{"content": "...", "document_id": 1, "original_filename": "cv.pdf", "page": 0}]}
{"type": "token",       "content": "..."}
{"type": "suggestions", "suggestions": ["...", "..."]}
{"type": "title",       "title": "..."}
{"type": "done",        "session_id": 1, "session_token": "..."}
{"type": "error",       "message": "..."}
```

`sources` arrives first and is emitted even in general mode, where it is empty — one event contract serves both modes so the client needs no branch. `token` events are zero or more, in order. `suggestions` is skipped in general mode, because the suggestions prompt asks for follow-ups about Vince, which that mode does not answer. `title` appears on the opening turn only, generated by whichever provider owns the mode. `error` replaces the remaining tokens on a mid-stream failure.

### Regeneration

With `regenerate: true`, `question` is ignored but a valid session and token are required. Aixia reads the last two messages; if they are not an assistant preceded by a user, it returns 400. Otherwise it deletes the stale answer, reuses the previous question, and **trims the trailing history entry** — without that trim the question would appear both as the current question and as the last line of history.

### `GET /healthz/`

Liveness probe returning `{"status": "ok"}`. It deliberately touches neither the database nor any upstream API: this answers "is the process accepting requests", not "is every dependency healthy". A Supabase blip should not convince Render to kill a working container.

It is exempt from the HTTPS redirect, because Render probes over plain HTTP internally and a 301 would read as unhealthy. **A green `/healthz/` beside a failing chat request is the signature of a bad `DATABASE_URL`**, not a healthy service.

### Session tokens

Produced with Django's `signing.dumps` under the salt `aixia-chat-session`, signed with the secret key, valid 30 days. A client supplying a `session_id` must supply the matching token; supplying neither yields a new session. This is what stops a visitor reading another's conversation by guessing a sequential integer id.

---

## 7. Data Model

- **Document** — `file` (FileField, `upload/`), `original_filename` (max 120 chars, preserved even if storage renames the stored file), `uploaded_at`, `is_ingested`. The flag makes ingestion idempotent: a second request returns early instead of duplicating chunks.
- **ChatSession** — `created_at` only. No owning user; access control is the signed token.
- **ChatMessage** — `session` FK (cascade, related name `messages`), `role` (`user` / `assistant`), `content`, `created_at`.
- **Vector rows** — written by `langchain-postgres` into the same database. Chunk metadata carries `document_id` and `original_filename` (stamped at ingestion) plus `source`, `page` and `total_pages` (from the loader).

### The citation contract

Three pieces of code must agree, and a comment in `f_chains.py` says so. `format_docs()` numbers chunks 1-based in retrieval order; `_serialize_sources()` preserves that order; the frontend treats `[n]` as `sources[n-1]`. Breaking any one silently misattributes citations.

---

## 8. Frontend

`ChatWindow.js` is the stateful root: conversations, streaming, mode, theme, voice wiring and backend status. Each chat holds an id, title, messages, `sessionId`, `sessionToken` and `updatedAt`. Streaming chats are tracked in a `Set`, not a boolean, so switching conversations mid-answer leaves both working.

### Components

- **`Markdown.js`** — hand-rolled renderer covering exactly what the answer prompt asks for: nested ordered/unordered and task lists, tables, fenced code, blockquotes, rules, inline emphasis/code/links. Hand-rolled rather than a library for two reasons: `[n]` markers must become buttons wired to the sources panel, and it renders **mid-stream**, so every branch must tolerate a half-written document — an unterminated fence renders as code, a ragged table still renders. Only `http(s):` and `mailto:` links are made clickable. **Extend it rather than reaching for a library.**
- **`typingPacer.js`** — Groq returns tokens in lumps, and painting each lump on arrival makes text jump rather than type. The pacer buffers tokens and drains them at a steady rate (30 ms tick, 70 c/s base). Its rate comes from a **deadline** (`pending / secondsRemaining`), not `pending / WINDOW`; the latter is exponential decay that only approaches the base rate and never lands, taking 7.6 s to drain a 3000-character answer.
- **`MessageRow.js`** — one turn: bubble, copy, regenerate, thumbs up/down, follow-up chips.
- **`SourcesPanel.js`** — the retrieved excerpts, focus-trapped, Escape to close, scrolling the highlighted source into view when a citation is clicked.
- **`ThinkingBubble.js`** — rotating wait phrases on the mockup's exact cadence (950 ms rotation, 160 ms fade), starting at a random index so consecutive answers differ.
- **`Composer.js`** — input, microphone button, and PDF upload mirroring the backend's 20 MB ceiling.
- **`AppHeader.js`** — Xia, the mode switch, status pill, and the voice and theme toggles.
- **`Sidebar.js`**, **`icons.js`**, **`sourceLabel.js`** — conversation list with inline rename, shared SVGs, and the one function that names a chunk (`filename · p.N`, converting the loader's 0-based page) for all three places that display one.

### Xia — `components/xia/`

Xia is an abstract, non-humanoid SVG sigil in the header with four states — **idle, listening, thinking, speaking** — driven by the stream events the backend already emits and by the typing pacer's settle.

**Abstract is a decision, not a placeholder.** A mascot risks reading as a toy on a portfolio piece, and real lip-sync is impossible: `speechSynthesis` renders straight to the audio device, so its output cannot be routed into Web Audio for an amplitude envelope, and its `boundary` event is unreliable outside Chrome. An abstract form needs only start and end. **Do not "improve" this into a face without revisiting both reasons.**

| File | Responsibility |
|---|---|
| `Xia.js` | the SVG sigil itself |
| `useXiaState.js` | the four-state machine |
| `chatStream.js` | one full turn: POST, parse NDJSON, pace the reveal |
| `tts.js` | `createSpeaker()` over `speechSynthesis` |
| `stt.js` | `createListener()` over the Web Speech API |
| `speakable.js` | Markdown → something worth hearing |

**`chatStream.js` holds one turn of conversation** as `streamChat()` — a plain async function rather than a hook, so it can be tested with a stubbed fetch and no renderer, and so a second view can drive a turn without duplicating the fetch or the settle/speak invariant. It was extracted specifically to unblock a `/voice` route.

### Voice

Both directions run in the browser. This project runs no audio backend, pays no per-request cost, and nothing waits on a cold start.

**That is not the same as "the audio never leaves the machine".** `SpeechRecognition` is implemented by the *browser*, and most implementations — Chrome's included — stream captured audio to a vendor service to be transcribed. Nothing reaches *this* application's servers and nothing is stored here, but a microphone press in Chrome does send audio to Google. Safari can recognise on-device once the language pack is installed. The experimental `processLocally` property is the standards-track way to require on-device processing and is the obvious next step once support is broad enough.

- **Push-to-talk, not always-on.** The microphone opens on a press and closes after one utterance.
- **Browser support is narrower than feature detection suggests.** Brave, Opera and Arc expose `SpeechRecognition` but ship without Google's speech key, so every attempt fails with `network`. **Detection by `typeof SpeechRecognition === 'function'` is therefore wrong** — the code treats a `network` error as fatal and withdraws the microphone for the session. Firefox keeps the API behind a flag, so the button is simply hidden there.
- **Detection happens in the pre-paint bootstrap**, alongside the theme, so server and client render the same HTML.
- **Markdown is stripped before speaking**, sharing the renderer's grammar. Citation markers are removed rather than read: hearing "one" after every other sentence is the most irritating thing a reading voice can do.

### Voice Mode

A **Chat / Voice** switch in the header swaps the conversation surface for a call: Xia large and centred, a single microphone button, and a live caption line. It is one route with an `interactionMode` state, not a second page — both surfaces drive the same turn through `streamChat()`.

The caption is a **status line, not a transcript**. It shows what Xia is hearing while you speak, then what she is doing, and surfaces a microphone error in place of either. Conversation history lives in Chat; switching back is what brings it into view.

### Theme

Light is the default; the header toggle persists the choice. **Three places must agree or the palette flashes on load**: the SSR `data-theme` on `<html>`, the pre-paint bootstrap script, and ChatWindow's `theme` `useState` initialiser. `themeTint.js` holds the `<meta name="theme-color">` values shared by all three, because Safari tints its status bar from them and they must track `--surface-0` per palette.

**CSS gotcha:** `--fast` and `--medium` in `globals.css` bundle duration *and* easing (`180ms var(--ease)`). Writing `var(--medium) var(--ease)` yields two timing functions, which makes the whole declaration invalid — the browser silently drops it and the motion never runs.

### Local persistence

`localStorage` keys `aixia-chat-history`, `aixia-conversation`, `aixia-theme-v2` and `aixia-voice`. Every read and write is wrapped in try/catch, since storage can be disabled or full; on failure the UI works in memory for that page load. History is restored after hydration, because browser storage is external state unavailable during server rendering.

### Design reference

`aixia-chat-mockup.html` at the repo root is the **finalized, authoritative design** — two floating glass panels over an ambient grid canvas, in light (cream + gold) and dark (navy + indigo). UI changes are checked against it rather than invented; deviations are deliberate and worth stating in the commit.

Intentional deviations already in place: collapsed, the AIxia logo *is* the expand button (the mockup hides its only toggle when collapsed, making collapse irreversible); the status pill sits in the header's right group; below 60rem an expanded sidebar floats over the thread as a drawer with `.main` carrying `grid-column: 2`; the hero's starter prompts are one row drawn per conversation from a 12-item pool.

---

## 9. Configuration

### Backend environment

- `DJANGO_SECRET_KEY` — signs session tokens. With `DJANGO_DEBUG=False` and no key, startup raises rather than running insecurely. In debug, a random throwaway key is generated per start, which invalidates existing tokens — local development only.
- `DJANGO_DEBUG` — defaults true.
- `DATABASE_URL` — full PostgreSQL URL; required, since the vector store lives in the same database. Falls back to `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` for the relational connection only.
- `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` — comma-separated. Hosts carry no scheme; CSRF origins must. `RENDER_EXTERNAL_HOSTNAME` is appended automatically and the LAN IP is detected and added for local network access.
- `GROQ_API_KEY`, `GROQ_MODEL` (default `qwen/qwen3.8-27b`), `GROQ_MAX_TOKENS` (700), `GROQ_SUGGESTION_MAX_TOKENS` (200), `GROQ_TITLE_MAX_TOKENS` (24), `GROQ_REASONING_EFFORT` (`none`), `GROQ_TEMPERATURE` (0.2), `GROQ_EXTRAS_TEMPERATURE` (0.7).
- `GOOGLE_API_KEY` — serves **both** embeddings and general-mode chat, so general mode needs no new credential.
- `EMBEDDING_MODEL`, `CHUNK_SIZE` (2000), `CHUNK_OVERLAP` (250), `RETRIEVAL_K` (5), `PGVECTOR_COLLECTION`.
- `GENERAL_MODEL` (default `gemini-3.6-flash`), `GENERAL_MAX_TOKENS` (1200), `GENERAL_TEMPERATURE` (0.7), `GENERAL_THINKING_BUDGET` (0).
- `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_ENDPOINT_URL`, `AWS_S3_REGION_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — presence of the bucket name switches media to S3; without it uploads land on the container filesystem and are destroyed on the next deploy.

Note that `qwen3.6` and `llama-3.3-70b-versatile` both 404 on a current free Groq key.

With debug off, Django also enables `SECURE_SSL_REDIRECT` (exempting `/healthz/`), HSTS for a year with subdomains and preload, `SECURE_CONTENT_TYPE_NOSNIFF`, and trusts `HTTP_X_FORWARDED_PROTO` as the TLS signal behind the proxy.

### Frontend environment

`BACKEND_INTERNAL_URL` — where the Next.js server proxies `/api`, `/admin` and `/static`. Read server-side only, never inlined into the browser bundle, so changing it needs a restart rather than a rebuild. Defaults to the Docker service name `http://backend:8000`.

The health probe is rewritten specially: the browser calls `/api/healthz`, which maps to the backend's `/healthz/` rather than to `/api/healthz/`, since the probe deliberately sits outside the API prefix.

**There is no `NEXT_PUBLIC_*` API origin, and there should not be one.**

Secrets live only in environment variables. `backend/.env`, `frontend/.env.local` and `deploy.env` are gitignored; only `.env.example` templates are committed.

---

## 10. Running Aixia

### Local, with Docker

`docker-compose.yml` defines `db` (postgres:16-alpine, health-checked), `backend` and `frontend`. Host ports are `AIXIA_BACKEND_PORT` (default 8001) and `AIXIA_FRONTEND_PORT` (default 3000), so a collision is resolved by editing the root `.env` with no rebuild. `docker-compose.override.yml` bind-mounts `./backend` for live source; `docker-compose.prod.yml` sets restart policies, turns debug off, and passes secrets through.

```bash
# set GROQ_API_KEY and GOOGLE_API_KEY in backend/.env first
docker compose up --build
docker compose exec backend python manage.py migrate
```

### Local frontend dev server

Use the dev server on port **3210**, defined in `.claude/launch.json` — **not** port 3000, which is the containerised build and goes stale. Because that server runs on the host it cannot resolve the Docker service name `backend`, so `frontend/.env.local` must point at the published host port:

```
BACKEND_INTERNAL_URL=http://localhost:8001
```

### Ingesting a document

Upload via the API or the composer's attach control, then run the **Ingest selected documents** action in the Django admin. On the deployed instance the admin action is the only way to index anything at all, because Render's free tier has no shell. Each document is handled independently and reports its own outcome, so one malformed PDF cannot silently abort a batch.

Because Render has no shell, `createsuperuser` and similar are run locally against the production `DATABASE_URL`.

---

## 11. Production Deployment

### Topology

Frontend on **Vercel** (root directory `frontend`, needs `BACKEND_INTERNAL_URL`). Backend on **Render** via `render.yaml` Blueprint — Docker runtime, free plan, **singapore** region. Postgres + pgvector and S3-protocol Storage on **Supabase**, `ap-southeast-1`.

**Region matters.** A chat request makes several database round trips — session lookup, message insert, vector search, message insert — so a cross-Pacific split would add roughly 180 ms to each. Render cannot change a service's region after creation.

**The database URL must be the Supabase session pooler** — port 5432 on the `aws-N-<region>.pooler.supabase.com` host, not the direct connection Supabase shows first, which is IPv6-only and unreachable from Render. Session mode rather than transaction mode (6543), because `langchain-postgres` uses psycopg3, whose prepared statements break under transaction pooling.

**Migrations run in `dockerCommand` (`/app/start.sh`)**, because Render's `preDeployCommand` is paid-tier only. One Gunicorn worker rather than three: the free tier has 512 MB and each worker is a full copy of the app. Threads rather than processes, because a sync worker is tied up for a whole streamed response. `start.sh` is passed as a plain path — Render already runs the command through a shell, so a self-wrapped `sh -c "a && b"` is read as one command name and dies with exit 127.

In `render.yaml`, `sync:` takes a boolean meaning "not managed here, prompt for it"; a literal value needs `value:`. **Only `value:` entries are re-applied when the blueprint syncs.**

### The admin is proxied through Next, deliberately

This is not cosmetic. Admin served from the backend's own domain sets a **host-only session cookie the browser never sends to the frontend origin**, so uploads stay 403 however many times you sign in.

The rewrite must re-add the trailing slash: without it, `APPEND_SLASH` folds the query into its own `?next=` and the login URL grows on every redirect. `CSRF_TRUSTED_ORIGINS` must carry the frontend origin for any of it to work — it is required, not optional.

### A proxy gotcha worth keeping

Next.js 308-redirects `/api/chat/stream/` to the slashless path *before* rewrites run; the browser re-POSTs, Next proxies a slashless path to Django, and `APPEND_SLASH` cannot redirect a POST without dropping the body — so it raises and every chat message 500s. `next.config.mjs` therefore sets `skipTrailingSlashRedirect: true` **and** ends the rewrite destination in `/`. The second half is required on its own: Next strips the trailing slash while matching, so `:path*` never carries it.

### Three free-tier limits — none of them bugs

Each first appeared as a confusing production-only symptom. When Aixia misbehaves only in production, check these before reading code.

- **Groq: 1000 output tokens/minute per organisation** — roughly one chat turn per minute across *all* users combined, not per user. Surfaced as an intermittent 429.
- **Gemini: 100 embedded chunks/minute.** A failed ingestion still spends the quota, so retrying early keeps the window permanently full. Ingest one document, then wait a clear minute. Surfaced as a document that could never index however often it was retried. The admin action detects `RESOURCE_EXHAUSTED`/429 and replaces the raw JSON wall with that instruction.
- **Render free sleeps after 15 minutes idle**, and the next visitor pays a cold start of up to a minute. Whoever is actively testing keeps it warm, so the owner rarely sees the delay everyone else hits.

---

## 12. Testing

The split mirrors the architecture. **The test runners are not interchangeable.** `manage.py test chat` works. `rag` and `documents` import pytest, which is deliberately absent from the production image, so they error under the Django runner — run those with pytest instead.

```bash
cd backend
pytest apps/rag
python manage.py test chat --keepdb
```

Django app labels are `chat` and `rag`, not `apps.chat`.

| Suite | Covers |
|---|---|
| `rag/test_e_prompts.py` | the prompt contract: naming rules, answer-first opening, no headings, structure as requirement, citation format, redirect-on-miss |
| `rag/test_f_chains_stream.py` | streaming returns docs unchanged and text with thinking stripped; `format_docs` numbers 1-based; all four suggestion paths return a list rather than raising |
| `rag/test_f_chains_retrieval.py` | `RETRIEVAL_K` defaults to 5, is overridable by environment, and an explicit `k` wins |
| `rag/test_f_chains_temperature.py` | answers default to `ANSWER_TEMPERATURE`, it is above zero so regenerate can differ, extras run hotter, explicit values (including zero) are honoured |
| `rag/test_g_stream_filter.py` | plain text passes through; a complete block is removed; tags split across chunks are removed; an unterminated trailing block is dropped |
| `chat/test_stream_view.py` | full event ordering; persistence of exactly one user and one assistant message; a bad token rejected with 403 *before* any streaming; the three regeneration cases |
| `chat/test_general_mode.py` | mode defaults to grounded when absent, accepts `general`, rejects unknown values; general skips retrieval and emits empty sources; general offers no follow-ups; general is rate limited per client and grounded is not caught by that throttle |

Frontend checks are `npx eslint .` and `npm run build` in `frontend/`. **The build is where hydration mismatches surface.**

**Then run it.** Tests passing is not evidence that a feature works — start the dev server and drive the actual change in the browser.

**Planned:** Playwright end-to-end tests, Locust load testing, and RAGAS evaluation. RAGAS matters most, because it measures what unit tests cannot: whether retrieval surfaces the right chunks and whether an answer is faithful to them.

---

## 13. Security

### What is protected

Signed session tokens make sequential session ids unguessable. `IsAdminUser` gates upload and ingestion, so a visitor cannot inject documents. Uploads are validated by extension and size. General mode is throttled per visitor at 10/hour; grounded chat keeps the looser anonymous rate. Startup refuses to run with debug off and no secret key. Both containers run as non-root users. In production HTTPS is enforced, HSTS is set for a year, and CSRF origins are explicit.

### Open item: the September 2026 credential exposure

`Credentials.txt` was committed in `b6777a8` and sat readable in the **public** repo. It held the Supabase Storage S3 access key pair and the production Postgres connection string.

**Both were rotated and verified dead on 2026-09-18.** The S3 key refuses a bucket list with HTTP 403; the Postgres password refuses with `FATAL: password authentication failed`. The file is untracked and gitignored as of `3bb7b5a`.

**The secrets are still in git history**, and `b6777a8` still serves the file. Purging needs `git filter-repo` plus a force-push, deliberately left to Vince: it cannot un-leak what was already public, and the secrets it would protect are already dead. Treat this as open but not urgent, and **do not assume it has been done.**

**The lesson worth carrying:** rotation "succeeded" twice while nothing had actually changed, because the prompt offered the old value as a default and pressing enter accepted it. Production stayed healthy throughout, so every downstream check passed — the rotation had been verified by confirming the app still worked, which is true whether or not anything rotated.

> When rotating any credential, verify the **old** one is now **rejected**. Do not verify by confirming the service still works.

### What is not protected

There is no authentication on chat, so anyone reachable can spend Groq quota; throttling bounds this without eliminating it. Session tokens live in `localStorage`, readable by any script on the page — acceptable for a public chatbot with no sensitive data, not for confidential conversations. Every retrieved chunk is sent to Groq and every question to Gemini, so ingesting a document discloses it in fragments to two external services, and a microphone press in Chrome sends audio to Google. Uploaded PDFs are checked only for extension and size. The development compose file sets `ALLOWED_HOSTS` to `*` and allows all CORS origins — explicitly a development posture, overridden in `docker-compose.prod.yml`.

---

## 14. Known Limitations

- **Ingestion is synchronous**, with no progress reporting or retry; a background queue is the fix.
- **PDF only**, with no OCR — `ALLOWED_EXTENSIONS = {'.pdf'}` and the loader calls PyMuPDF with `filetype='pdf'`.
- **No API path to delete or re-ingest** a document's vectors; `is_ingested` is one-way.
- **Retrieval has no reranking, no hybrid keyword search and no query rewriting** — so a follow-up like "and what about that one?" retrieves poorly, since the pronoun carries no retrievable meaning even though history reaches the generation step.
- **History is capped at 20 messages**, sent verbatim with no summarisation.
- **Grounding is prompt-enforced, not verified** — no automatic check that a claim is supported by a retrieved chunk, and citation numbers are range-checked but not validated for correctness.
- **Grounded answers cap at 700 output tokens**, so a long answer is truncated.
- **Feedback is local only** — thumbs up/down never reaches the backend.
- **No stop control** once a stream is in flight.
- **Voice Mode is a view toggle, not a route**, so it cannot be deep-linked or shared.
- **Speech recognition is unavailable in Brave, Opera, Arc and Firefox**, and the microphone is withdrawn for the session on a `network` error.

### Gotchas that cost hours

- **Restart the backend after editing it.** Gunicorn runs without `--reload`, so a request against stale code returns a cheerful 200: `docker compose restart backend`.
- **Clear `.next` when appended CSS does not apply.** Turbopack serves a stale chunk: the rules compile without error, HMR reports success, and the new selectors are simply absent from the CSSOM while older ones are present. Confirm with a CSSOM query for your class, then `rm -rf frontend/.next` and restart. **This presents as a specificity bug and is not one.**

---

## 15. Roadmap

**Done:** the standalone RAG pipeline; Django and Postgres integration; upload and ingestion; the session-aware chat API; multi-turn context; the Next.js frontend; token-by-token streaming with server-side reasoning stripping; unit tests; Dockerised local development; the live free-tier deployment on Vercel, Render and Supabase with pgvector; two-way browser voice; Xia as a four-state presence; two modes with separate providers and budgets; and a hands-free Voice Mode surface.

**Next:** Playwright end-to-end coverage, Locust load testing, RAGAS retrieval and faithfulness evaluation, and a shareable deep link into Voice Mode. Optionally, air quality sensor data from the AeroBand project as a second retrieval domain alongside the CV.

---

## 16. Glossary

**Chunk** — a passage cut from a document before indexing. Aixia's are 2000 characters with 250 of overlap.

**Embedding** — a vector representing the meaning of text, so semantically similar passages sit close together regardless of shared words.

**Grounded mode** — the default. Retrieves from the corpus, cites `[n]`, and refuses when the context is insufficient.

**General mode** — ungrounded chat on Gemini Flash, with no retrieval and no sources, rate limited to 10/hour per visitor, and declining to answer questions about Vince.

**NDJSON** — newline-delimited JSON, the streaming format where each line of the response body is one complete JSON object.

**pgvector** — the Postgres extension storing embeddings and answering similarity queries, replacing an earlier on-disk Chroma store.

**RAG** — retrieval-augmented generation: retrieve relevant passages, then supply them to a language model so its answer is grounded in them.

**Session token** — a cryptographically signed string encoding a session id, preventing one visitor from reading another's conversation by guessing an integer.

**Thinking block** — internal reasoning a model emits inside `<think>` tags, billed against the output cap and stripped before the user sees it.

**Xia** — the abstract SVG presence in the header, with idle, listening, thinking and speaking states.
