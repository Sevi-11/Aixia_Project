# AIxia Response Behavior — Design

**Date:** 2026-09-07
**Status:** Awaiting review
**Scope:** How AIxia answers — persona, naming, formatting, pacing, creativity,
and the greeting that opens a conversation.

## Problem

The answer prompt in `backend/apps/rag/e_prompts.py` is a general-purpose
formatting manual — 4,499 characters, roughly 1,125 tokens — bolted to a
portfolio RAG bot whose answer budget is 700 tokens. The policy governing the
answers is longer than the answers themselves, and it authorises headings,
nested lists, checklists, and comparison tables for a bot that answers
questions about one person's background.

The persona is a single clause — *"try to be friendly and start up a
conversation"* — which pulls toward chatty filler that an evaluating reader
does not want.

Three further defects follow from the model configuration:

- `temperature=0` is applied to answers, follow-up suggestions, and titles
  alike. Regenerate (`ChatStreamView`, `regenerate=True`) deletes the previous
  answer and asks again, so at temperature 0 the user is handed back
  effectively the same text. The feature reads as broken.
- The prompt is written around the name "Sean". That is a real name — the one
  he uses at home — but it is the wrong register for a recruiter, and it is
  not how he introduces himself professionally.
- A miss ("I don't have that information") is a dead end, and misses are the
  most-travelled path in a portfolio bot: recruiters ask about availability,
  rate, and frameworks that were never in the corpus.

## Audience and intent

AIxia serves two evaluative readers:

- **Recruiters and hiring managers** — want the fact fast, in a scannable
  shape, with no filler.
- **Technical peers and interviewers** — probe depth on projects and
  decisions; want substance first, comfortable with detail.

Both are evaluating. Neither wants warmth in place of information.

## Decisions

| Dimension | Decision |
|---|---|
| Voice | Third person about Vince, always. AIxia is his assistant, never him. |
| Name | "Vince" by default. "Vince Viñas" is fine on a first or formal mention. The full legal name only when asked for it. Never "Sean" alone. |
| Shape | Answer-first: one direct sentence, then optional supporting detail. |
| Length | 2–4 sentences by default. |
| Creativity | Stoic answers (temp 0.2); creative extras — suggestions and titles (temp 0.7). |
| Greeting | A static opening bubble that introduces AIxia and settles the name. Never generated. |
| Pacing | Unchanged. The existing pacer calibration stays exactly as tuned. |
| Misses | Decline plainly, then redirect to subjects the context does cover. |
| Retrieval | `k=3`, unchanged — not bundled into a behaviour change. |

## Prompt architecture

`e_prompts.py` composes `context_prompt` from named constants rather than one
string literal, so each rule block can be read, tuned, and asserted on
independently. Same file, no new modules.

### IDENTITY

    You are AIxia, an AI assistant that answers questions about Vince's
    professional background. Your readers are recruiters, hiring managers,
    and technical interviewers evaluating him.

    You speak ABOUT Vince, always in the third person. You are not Vince and
    never write as him. "I" refers to you, the assistant, never to Vince.

### NAMES

His full legal name is Sean Vincent Vien V. Viñas. He goes by Vince
professionally; "Sean" is the name his family uses at home. The prompt carries
the naming rule explicitly, because the retrieved documents will not:

    Call him "Vince". You may write "Vince Viñas" on a first or formal
    mention. Give his full legal name — Sean Vincent Vien V. Viñas — only
    when the question actually asks for his full or legal name, or when you
    are quoting a document that presents it as a credential.

    Never call him "Sean" on its own, and never adopt a longer form of his
    name from the Context as your way of referring to him.

### GROUNDING

    Answer only from the numbered Context below. Never invent, infer beyond,
    or embellish it.

    When the Context does not answer the question:
    1. Say plainly that it is not in what you have on Vince.
    2. Name one or two subjects the Context does cover, and offer them.

    Do not guess, and do not soften a miss into a vague half-answer.

### SHAPE

    Open with one sentence that answers the question directly. No preamble,
    no restating the question, no "Great question".

    Add supporting detail only when it adds something:
    - prose for reasoning, narrative, or context
    - a bulleted list for three or more parallel items
    - a Markdown table only when comparing two or more things across the
      same attributes

    Default to two to four sentences. Do not use headings. Do not pad an
    answer to look thorough.

### VOICE

    Plain, precise, professional. Contractions are fine.
    No corporate filler ("leverage", "passionate about", "wealth of
    experience"). No exclamation marks, no flattery, no closing offer of
    further help.

### CITATIONS

Kept verbatim from the current prompt. This block is load-bearing:
`_serialize_sources()` in `backend/apps/chat/b_views.py` and the frontend `[n]`
parser in `frontend/components/Markdown.js` both assume `sources[n-1]` is the
chunk numbered `[n]`. Renumbering, a trailing "Sources" list, or `[1,2]` in
place of `[1][2]` all break the sources panel.

### Removed

- Heading hierarchy rules (headings are now disallowed outright).
- The checklist section, table-width guidance, and the general Markdown
  preamble.
- `DO NOT INCLUDE YOUR THINKING PROCESS` — already covered three times over by
  `reasoning_effort=none`, `_strip_thinking()`, and `strip_thinking_stream()`.

Net effect, measured: 2,326 characters (~582 tokens) in place of 4,499
(~1,125). Roughly half.

## Model parameters

`get_llm()` currently hardcodes `temperature=0`. It gains a `temperature`
argument alongside the existing `max_tokens`.

| Call site | Temperature | Env var | Rationale |
|---|---|---|---|
| `answer_question`, `answer_question_stream` | 0.2 | `GROQ_TEMPERATURE` | Grounded and repeatable, but regenerate now yields genuinely different phrasing. |
| `generate_followup_suggestions` | 0.7 | `GROQ_EXTRAS_TEMPERATURE` | Producing three varied questions is the whole job. |
| `generate_title` | 0.7 | `GROQ_EXTRAS_TEMPERATURE` | Same knob; one call, 24 tokens. |

`ANSWER_MAX_TOKENS` stays at 700. It is a hard Groq free-tier constraint, and
answer-first with a 2–4 sentence default should rarely approach it.

`suggestions_prompt` also has "Sean" replaced with "Vince".

## Opening greeting

Every new conversation opens with AIxia introducing itself, in an assistant
bubble rather than a banner. This matches `aixia-chat-mockup.html:646`, where
the canonical opening is AIxia speaking rather than a hero headline.

    Hi, I'm AIxia — assistant to Vince Viñas (Sean Vincent Vien V. Viñas on
    paper; he goes by Vince).

    Ask me anything about his background, skills, or projects. I answer from
    his CV and notes, with sources you can check.

The naming note is a parenthetical, not a paragraph. It exists to head off a
mismatch the visitor will genuinely hit — the CV and source citations carry the
full legal name — without spending the first impression on a footnote.

### The greeting is static

It is a constant in the frontend. It never goes through the LLM. Generating it
would spend free-tier answer budget before the visitor has asked anything, add
latency ahead of the first real reply, reword itself every session, and risk
the model editorialising about his name. Fixed copy costs nothing and cannot
drift.

Consequences the implementation must honour:

- Never POSTed to `/chat/stream`, and never written to `ChatMessage`.
- Never included in the `history` passed to `format_history()` — it would
  consume input tokens to tell the model something the prompt already says.
- Not routed through `typingPacer`. A static string should appear at once;
  faking a thinking beat for canned copy is a lie the reader can feel.
- Carries no sources, no citations, and no follow-up suggestions.
- Reappears with each new conversation, since it belongs to the empty state
  rather than to the session record.

### Effect on the empty state

The greeting bubble replaces the `empty-hero` headline and paragraph in
`ChatWindow.js:517`, which say the same thing less directly. The starter cards
stay, rendered below the bubble. They are an app-only feature with a rotation
pool and no equivalent in the mockup; dropping them would be a regression this
change was not asked to make.

## Out of scope

`typingPacer.js` (450 ms thinking beat, 70 c/s base, 2 s maximum lag) and
`Markdown.js` stay exactly as they are. The renderer will support more Markdown
than the prompt now emits; that asymmetry is the safe direction. The only
frontend change is the empty state described above.

## Files touched

- `backend/apps/rag/e_prompts.py` — rewritten answer prompt; name change in suggestions prompt.
- `backend/apps/rag/f_chains.py` — `temperature` parameter and the two constants; pass it at each call site.
- `backend/apps/rag/test_f_chains_temperature.py` — new.
- `frontend/components/GreetingBubble.js` — new; the static opening bubble.
- `frontend/components/ChatWindow.js` — greeting bubble replaces the empty-hero
  headline; starter cards retained beneath it. Also renames the two entries in
  `STARTER_POOL` that currently say "Sean".
- `frontend/app/globals.css` — `.empty-hero` top padding, which existed to give
  the removed headline room.
- `backend/.env.example`, `README.md` — document the two new env vars alongside
  the existing `GROQ_API_KEY` / `GROQ_MODEL` entries.

## Validation

1. **Unit** — each call site receives its intended temperature; both env vars
   override the defaults.
2. **Prompt contract** — the assembled template still contains the citation
   block and the `{context}`, `{question}`, `{history}` placeholders, so a
   future tone edit cannot silently break retrieval wiring.
3. **Regression** — `test_f_chains_stream.py`, `test_g_stream_filter.py`, and
   `test_stream_view.py` stay green.
4. **Live** — rebuild and restart the backend container, run the frontend dev
   server on port 3210, and put six real questions through it:
   - a factual lookup ("what languages does he use")
   - an open question ("tell me about Vince")
   - a comparison (should produce a list or table, not prose)
   - a regenerate (must return different wording)
   - two misses (salary; a framework not in the corpus) — each must decline
     and then redirect
   - a direct name question ("what's his full name?") — must return
     Sean Vincent Vien V. Viñas, while every *other* answer in the session
     still says "Vince"
5. **Greeting** — open a new conversation and confirm the bubble appears
   immediately with the starter cards below it; then send one question and
   confirm via the network tab that the greeting text appears in no request
   payload, and via the Django admin that no `ChatMessage` row was written
   for it.

## Risks

- **Temperature 0.2 loosens grounding.** Small, but real for a bot whose
  credibility is the product. The two miss cases in the live check are the
  guard; if either invents, drop to 0.1.
- **The naming rule may fight the documents.** The corpus almost certainly
  leads with "Sean Vincent Vien V. Viñas", and models tend to adopt whatever
  form the context hands them. This rule is also more delicate than a flat
  override: the full name must stay *reachable* when someone asks for it,
  while never becoming the default address form. If the live check shows the
  model drifting to "Sean", the fallbacks in order are (1) tighten the NAMES
  block, (2) normalise the display name at ingestion so the retrieved chunks
  themselves say "Vince", keeping the legal name only where it is a credential.
- **"No headings" may over-flatten a genuinely long answer.** Acceptable: the
  2–4 sentence default means long answers should be rare, and bullets remain
  available.

## Rollback

Every change is confined to two files and two environment variables. Reverting
the commit restores the previous behaviour; setting `GROQ_TEMPERATURE=0`
restores determinism without a deploy.
