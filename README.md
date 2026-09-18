# Aixia — Personal RAG Chatbot

Aixia is a full-stack, locally-run chatbot that answers questions about a person's background (CV/resume) using Retrieval-Augmented Generation (RAG). It's built as a hands-on portfolio project to bridge classical ML/embedded engineering experience with modern LLM/RAG application development.

Ask it something like *"What machine learning experience do you have?"* and it retrieves the relevant, grounded facts from an uploaded document and streams back an answer token-by-token — refusing to answer, rather than guessing, when the information isn't present.

## Features

- 📄 **Document ingestion** — upload a PDF (e.g. a CV), automatically chunked and embedded
- 🔍 **Retrieval-Augmented Generation** — answers are grounded in retrieved context, not model memory
- ⚡ **Streaming responses** — answers stream back token-by-token over a chunked HTTP response, instead of waiting for the full generation
- 🧠 **Fast hosted LLM inference** — grounded answers stream from Groq; embeddings come from the Gemini API
- 🗣️ **Two-way voice** — dictate a question and hear the answer read back, with no audio backend of this project's own ([see the caveat](#voice))
- 🌀 **Xia** — an animated presence that reflects what the assistant is actually doing: idle, listening, thinking, speaking
- 🔀 **Two modes** — *About Vince* (grounded, cited, refuses when unsure) and *General* (ungrounded chat, on a separate provider and budget)
- 💬 **Session-aware chat** — conversations persist across turns via a session ID
- 📎 **Source citation** — every answer includes which document chunk(s) it was grounded in
- 🚫 **Hallucination guardrails** — the model is explicitly instructed to say "I don't have that information" rather than fabricate an answer

## Tech Stack

| Layer | Technology                                                               |
|---|--------------------------------------------------------------------------|
| Frontend | Next.js                                                                  |
| Backend | Python, Django, Django REST Framework                                    |
| Database | PostgreSQL                                                               |
| RAG orchestration | LangChain                                                                |
| Embeddings | Gemini API (`gemini-embedding-001`, truncated to 768 dims)                |
| Vector store | pgvector, in the application's own Postgres                              |
| LLM (grounded) | Groq (streaming) — see `GROQ_MODEL`                                    |
| LLM (general) | Gemini Flash (streaming) — see `GENERAL_MODEL`                          |
| Speech in/out | Web Speech API + `speechSynthesis`, both client-side                    |
| Testing | pytest (rag/), Django test runner (chat/); Playwright, Locust, RAGAS planned |
| Deployment | Docker Compose (backend, frontend, Postgres)                            |

## Architecture

```
┌─────────────┐      ┌──────────────────┐       ┌─────────────────────┐
│   Next.JS   │────▶│   Django REST    │─────▶ │   rag/ (LangChain)  │
│  (chat UI)  │◀────│    Framework     │◀───── │  load → split →     │
└─────────────┘      └──────────────────┘       │  embed → retrieve → │
                             │                  │  generate           │
                             ▼                  └──────────┬──────────┘
                      ┌─────────────┐                      │
                      │ PostgreSQL  │                      ▼
                      │ (documents, │              ┌───────────────┐
                      │  sessions,  │              │ Chroma (local)│
                      │  messages)  │              └───────────────┘
                      └─────────────┘                      │
                                                           ▼
                                                   ┌─────────────────┐
                                                   │Groq (streaming) │
                                                   └─────────────────┘
```

**Two parallel data paths, kept intentionally decoupled:**
- `documents`/`chat` (Django apps) own everything relational — uploaded file records, chat sessions, message history — stored in PostgreSQL.
- `rag/` is a plain Python package with no Django dependency. It owns the actual retrieval/generation logic and can be tested standalone, outside the web layer entirely.

## Project Structure

```
backend/
├── config/                  # Django project settings, root URLs
├── apps/
│   ├── documents/            # Upload + ingestion pipeline (Django app)
│   │   ├── models.py          # Document model
│   │   ├── a_serializers.py
│   │   ├── b_services.py       # ingest_document(): ties rag/ pipeline to a Document row
│   │   ├── c_views.py
│   │   └── d_urls.py
│   ├── chat/                  # Session-aware chat API (Django app)
│   │   ├── models.py           # ChatSession, ChatMessage
│   │   ├── a_serializers.py
│   │   ├── b_views.py           # ChatView (blocking) + ChatStreamView (NDJSON streaming)
│   │   ├── c_urls.py
│   │   └── test_stream_view.py   # streaming endpoint tests (Django test runner)
│   └── rag/                    # Standalone RAG pipeline (plain Python, no Django deps)
│       ├── a_loader.py          # PDF loading
│       ├── b_splitter.py         # Chunking
│       ├── c_embeddings.py        # Local embedding model
│       ├── d_vectorstore.py        # Chroma build / load / add / search
│       ├── e_prompts.py             # Grounding prompt template
│       ├── f_chains.py               # Retrieval + generation chain (Groq, blocking + streaming)
│       ├── g_stream_filter.py         # Strips <think> reasoning blocks from a token stream
│       ├── test_f_chains_stream.py     # pytest
│       └── test_g_stream_filter.py      # pytest
├── data/                     # Chroma persistence (gitignored)
├── media/                    # Uploaded files (gitignored)
├── pytest.ini                # pythonpath = apps, for rag/'s standalone pytest suite
├── Dockerfile
└── manage.py

frontend/
├── app/
│   ├── layout.js
│   └── page.js              # renders ChatWindow
├── components/
│   └── ChatWindow.js          # chat UI: sidebar, streaming message list, input, sources display
├── Dockerfile
└── package.json

docker-compose.yml            # local dev: db + backend + frontend
docker-compose.override.yml    # dev-only: bind-mounts backend/ for live reload
docker-compose.prod.yml         # production overrides (restart policies, env passthrough)
qa/                           # Playwright, Locust, RAGAS (planned)
docs/                          # PRD, architecture notes, ADRs (planned)
```

## Two modes, two providers

The chat exposes two modes, and they do not share a model.

| | **About Vince** (default) | **General** |
|---|---|---|
| Retrieval | pgvector similarity search | none |
| Sources | cited inline as `[n]` | none, by design |
| Behaviour | refuses when the context is insufficient | answers generally; hands Vince questions back to grounded mode |
| Provider | Groq | Gemini Flash |
| Limit | the default `anon` rate | `10/hour` per visitor |

**Why the split.** Groq's free tier caps *output* tokens per minute at 1000 for
the whole organisation, and rejects a request up front when `max_tokens`
exceeds what is left of that ceiling. Grounded answers are short, cited, and
the thing this project exists to demonstrate, so they keep that budget to
themselves. Open-ended general chat would drain it in a couple of turns and
take the grounded demo down with it — during the hour someone is actually
looking. Gemini's free tier trades that per-minute cliff for a per-day request
ceiling, which is why general mode is additionally rate limited per visitor in
`apps/chat/d_throttles.py`.

An omitted `mode` always means grounded. A client that says nothing must never
start receiving unsourced answers about a real person.

**Degrading honestly.** When the general limit is hit, the assistant says it is
at capacity and points at the other mode. This matters more than it sounds:
with voice enabled, going quiet is indistinguishable from being broken.

## Voice

Both directions are driven from the browser — `SpeechRecognition` in,
`speechSynthesis` out. This project runs no audio backend, pays no per-request
cost, and nothing waits on a cold start.

**That is not the same as "the audio never leaves the machine", and the
distinction matters.** `SpeechRecognition` is implemented by the *browser*, and
most implementations — Chrome's included — stream the captured audio to a
vendor service to be transcribed. Nothing is sent to *this* application's
servers, and nothing is stored here, but a microphone press in Chrome does send
audio to Google. Safari can recognise on-device once the language pack is
installed. The experimental `processLocally` property (with
`SpeechRecognition.available()` and `SpeechRecognition.install()`) is the
standards-track way to require on-device processing, and is the obvious next
step here once support is broad enough to rely on.

- **Push-to-talk, not always-on.** The microphone opens on a press and closes
  after one utterance.
- **Graceful absence.** Firefox keeps `SpeechRecognition` behind a flag, so the
  microphone button is hidden there and typing is unaffected. Detection happens
  in the pre-paint bootstrap, alongside the theme, so the server and client
  render the same HTML.
- **No lip-sync, deliberately.** `speechSynthesis` renders straight to the audio
  device; its output cannot be routed into Web Audio for an amplitude envelope,
  and its `boundary` event is unreliable outside Chrome. Xia is an abstract
  form precisely so she needs only `start` and `end`. An engine that returned
  an `AudioBuffer` (Kokoro-82M in-browser, say) would make lip-sync possible —
  everything speaks to the `createSpeaker()` interface in
  `frontend/components/xia/tts.js`, so that swap is one file.
- **Markdown is stripped before speaking**, sharing the renderer's own grammar
  (`frontend/components/xia/speakable.js`). Citation markers are removed rather
  than read: hearing "one" after every other sentence is the single most
  irritating thing a reading voice can do.

## Prerequisites

- Python 3.11+
- PostgreSQL, running locally
- A free [Groq API key](https://console.groq.com) (used for LLM inference — embeddings stay local)
- Node.js 20+ (for the frontend)
- Alternatively: Docker + Docker Compose (see [Setup via Docker](#setup-via-docker) below — no local Python/Node/Postgres needed)

## Setup

1. **Clone the repo and set up a virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Create a PostgreSQL database:**
   ```sql
   CREATE DATABASE aixia_db;
   ```

3. **Configure environment variables** — create `backend/.env`:
   ```
   DB_NAME=aixia_db
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL=qwen/qwen3.6-27b
   ```

4. **Run migrations:**
   ```bash
   python manage.py migrate
   ```

5. **Start the Django server:**
   ```bash
   python manage.py runserver
   ```
6. **Enable CORS for local frontend access** — install and configure `django-cors-headers` (see Design Decisions below).

7. **Start the frontend** (in a separate terminal):
```bash
   cd frontend
   npm install
   npm run dev
```
   Visit `http://localhost:3000`.

## Setup via Docker

With Docker + Docker Compose installed, no local Python/Node/Postgres setup is needed:

1. Create `backend/.env` from `backend/.env.example` and set `GROQ_API_KEY` (and `DJANGO_SECRET_KEY` for anything beyond quick local use).
2. From the repo root:
   ```bash
   docker compose up --build
   ```
   This starts Postgres, runs the Django backend (gunicorn) on `http://localhost:8000`, and the Next.js frontend on `http://localhost:3000`. `docker-compose.override.yml` bind-mounts `backend/` for live code reload during development — restart the `backend` service after editing backend code to pick up changes, since gunicorn doesn't auto-reload.
3. Run migrations inside the container once it's up:
   ```bash
   docker compose exec backend python manage.py migrate
   ```

## LAN Access (Other Devices on Your Network)

Both servers bind to `0.0.0.0` by default, so other devices on your Wi-Fi/LAN can access Aixia. The backend auto-detects your machine's LAN IP and adds it to `ALLOWED_HOSTS` and CORS allowed origins.

1. **Find your machine's LAN IP** (e.g. `192.168.1.x`):
   ```bash
   # macOS / Linux
   ipconfig getifaddr en0    # or ip addr show
   # Windows
   ipconfig
   ```

2. **Start both servers** as described in Setup.

3. **On another device**, open:
   - `http://<YOUR_LAN_IP>:3000` — the chat UI
   - `http://<YOUR_LAN_IP>:8000` — the API directly

**Session isolation:** Each device/browser has its own chat history stored in `localStorage`. There is no shared state between devices — conversations on one phone/laptop won't appear on another. Backend session tokens are cryptographically signed per-session, preventing cross-device access.

## Configuration

Copy `backend/.env.example` to `backend/.env` and set only the values needed for your environment. The example file is a template and must not contain real secrets.

For local development, set `DJANGO_DEBUG=True` to opt into the local-only development secret fallback, then use either `DATABASE_URL` (a full `postgres://` URL) or the split variables `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` when `DATABASE_URL` is unset. LLM inference always goes through Groq — set `GROQ_API_KEY` and, optionally, `GROQ_MODEL` (defaults to `qwen/qwen3.6-27b`). Two optional knobs control sampling: `GROQ_TEMPERATURE` (answers, default `0.2`) and `GROQ_EXTRAS_TEMPERATURE` (follow-up suggestions and conversation titles, default `0.7`). `RETRIEVAL_K` (default `5`) sets how many chunks each question retrieves. General mode runs on a separate provider and has its own knobs: `GENERAL_MODEL` (default `gemini-3.6-flash`), `GENERAL_MAX_TOKENS` (default `1200`) and `GENERAL_TEMPERATURE` (default `0.7`); it reuses the `GOOGLE_API_KEY` that already serves embeddings, so it needs no new credential. Its per-visitor rate limit is the `general_chat` scope in `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`. `NEXT_PUBLIC_API_ORIGIN` should point to the Django API (falls back to `<current-hostname>:8000` in the browser if unset).

For Render, set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `GROQ_API_KEY`, and `GROQ_MODEL`. For Vercel, set `NEXT_PUBLIC_API_ORIGIN` to the Render API URL. Comma-separate multiple hostnames or allowed frontend origins in `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`.

## Usage

**Upload a document:**
```bash
curl -X POST http://127.0.0.1:8000/api/documents/upload/ -F "file=@path/to/cv.pdf"
```

**Trigger ingestion** (chunk, embed, store):
```bash
curl -X POST http://127.0.0.1:8000/api/documents/<document_id>/ingest/
```

**Ask a question** (blocking — waits for the full answer):
```bash
curl -X POST http://127.0.0.1:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What machine learning experience do you have?\"}"
```

**Continue a conversation** (reuse the returned `session_id`):
```bash
curl -X POST http://127.0.0.1:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": 1, \"question\": \"What about your education?\"}"
```

Each response includes the grounded `answer` plus a `sources` array showing exactly which document chunk(s) it drew from.

**Ask a question, streamed** (what the frontend actually uses): `POST /api/chat/stream/` takes the same request body, but returns newline-delimited JSON events as the answer generates instead of waiting for it to finish:
```bash
curl -N -X POST http://127.0.0.1:8000/api/chat/stream/ \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What machine learning experience do you have?\"}"
```
```
{"type": "sources", "sources": [...]}
{"type": "token", "content": "Hi"}
{"type": "token", "content": " there!"}
...
{"type": "done", "session_id": 1, "session_token": "..."}
```
Sources arrive as a single event immediately after retrieval, before generation starts. A mid-stream failure emits `{"type": "error", "message": "..."}` instead of `done`. Any `<think>...</think>` reasoning the model emits is stripped from the token stream server-side before it reaches the client (see `rag/g_stream_filter.py`).

## Design Decisions

A few choices worth calling out (fuller reasoning to live in `docs/adr/` as the project matures):

- **Chroma over FAISS** — chosen for built-in disk persistence and metadata handling, at the cost of slightly more dependencies. Not a hardware/performance decision; both are lightweight enough for local use.
- **Local embeddings (`all-MiniLM-L6-v2`) over an API-based embedding service** — free, no external calls, small enough to not compete with the LLM for resources.
- **`rag/` kept fully decoupled from Django** — the retrieval/generation logic has no framework dependency, so it can be tested and iterated on independently of the web layer.
- **Groq for LLM inference** — free-tier, no local GPU/RAM requirements, and fast enough to stream comfortably; the tradeoff is a dependency on an external API and its rate limits, unlike the fully local embeddings/vector-store path.
- **CORS via `django-cors-headers`** — Next.js dev server (`localhost:3000`) and Django (`127.0.0.1:8000`) are different origins; the browser blocks cross-origin requests by default, so `CORS_ALLOWED_ORIGINS` explicitly permits the frontend's origin.
- **NDJSON over a hand-rolled protocol, not SSE** — the frontend already used `fetch()` with a JSON POST body; `EventSource` (the standard SSE client) only supports GET, so a `StreamingHttpResponse` of newline-delimited JSON objects, read via `response.body.getReader()`, fit the existing request shape without adding a second transport.

## Roadmap

- [x] Standalone RAG pipeline (load → split → embed → store → retrieve → generate)
- [x] Django + PostgreSQL integration
- [x] Document upload + ingestion API
- [x] Session-aware chat API
- [x] Multi-turn conversational context (follow-up questions aware of chat history)
- [x] Next.js frontend
- [x] Real-time streaming responses (token-by-token via NDJSON, with server-side `<think>` tag stripping)
- [x] Dockerized local dev + prod setup (Postgres, backend, frontend via Docker Compose)
- [x] Unit tests for the streaming pipeline (`pytest` for `rag/`, Django test runner for `chat/`)
- [ ] QA suite: Playwright E2E, Locust load testing
- [ ] RAGAS-based retrieval/faithfulness evaluation
- [ ] Free-tier deployment (frontend + backend + hosted Postgres w/ pgvector)
- [ ] Optional: air quality sensor data (AeroBand project) as a second retrieval domain

## License

Personal portfolio project. All rights reserved unless stated otherwise.
