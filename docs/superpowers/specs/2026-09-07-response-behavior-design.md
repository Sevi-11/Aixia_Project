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
| Greeting | Static hero copy that settles the name. Never generated, never a message. |
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

    Add supporting detail only when it adds something, and match its form to
    the content:
    - Use prose for reasoning, narrative, or context.
    - When your answer names four or more tools, skills, items, or examples,
      you MUST present them as a bulleted list rather than running them
      together in a sentence. Where they fall into categories, group them
      under short bold labels.
    - When the question asks you to compare two or more things, you MUST
      answer with a Markdown table, one row per attribute being compared.

    When you use a list or a table, the opening sentence introduces it and
    must not enumerate the same items in prose first. Say it once.

    A prose answer defaults to two to four sentences. Do not use headings.
    Do not pad an answer to look thorough.

The list and table rules are stated as MUST rather than may, and that wording
was earned rather than chosen. Written as permissions, both lost every time:
"default to two to four sentences" and "do not pad" read as instructions, so
ten tools arrived as a paragraph and a comparison came back as prose. The
"say it once" line was added after the MUSTs landed, because the model then
wrote the full list twice — once as prose, once as bullets.

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

Net effect, measured: 2,763 characters (~691 tokens) in place of 4,499
(~1,125). Headroom against the old policy is now thinner than the first draft
suggested, because the structure rules had to be restated as requirements —
so any further addition should displace something rather than accumulate.

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

The empty state carries the introduction, in the existing hero rather than a
chat bubble. An earlier revision put it in an assistant bubble, matching
`aixia-chat-mockup.html:646` where the canonical opening is AIxia speaking;
that was built, reviewed in the browser, and rejected in favour of the hero.
The hero states the naming rule without staging a message the assistant never
actually sent.

    Ask me anything about *Vince*

    I answer from his CV, projects and notes -- grounded in the documents,
    with the sources you can check. He's Sean Vincent Vien V. Viñas on paper,
    but goes by Vince.

The naming note is the paragraph's second sentence, not its subject. It exists
to head off a mismatch the visitor will genuinely hit -- the CV and source
citations carry the full legal name -- without spending the first impression
on a footnote.

### The greeting is static

It is markup in the frontend. It never goes through the LLM. Generating it
would spend free-tier answer budget before the visitor has asked anything, add
latency ahead of the first real reply, reword itself every session, and risk
the model editorialising about his name. Fixed copy costs nothing and cannot
drift.

Being hero markup rather than a message is what makes this structural: there
is no message object, so nothing can POST it to `/chat/stream`, write it to
`ChatMessage`, pad it into `format_history()`, or hang copy, regenerate, and
feedback controls off it. Verified against the database: 0 of 137 stored
messages contained greeting text.

### Effect on the empty state

None beyond the paragraph's second sentence. The `empty-hero` headline,
padding, and the starter cards beneath it are unchanged. The two starter
prompts that said "Sean" are renamed to "Vince".

## Out of scope

`typingPacer.js` (450 ms thinking beat, 70 c/s base, 2 s maximum lag) and
`Markdown.js` stay exactly as they are. The renderer will support more Markdown
than the prompt now emits; that asymmetry is the safe direction. The only
frontend change is the empty state described above.

## Files touched

- `backend/apps/rag/e_prompts.py` — rewritten answer prompt; name change in suggestions prompt.
- `backend/apps/rag/f_chains.py` — `temperature` parameter and the two constants; pass it at each call site.
- `backend/apps/rag/test_f_chains_temperature.py` — new.
- `frontend/components/ChatWindow.js` — the naming sentence is added to the
  empty-hero paragraph, and the two `STARTER_POOL` entries that said "Sean" are
  renamed. The headline, the starter cards, and `globals.css` are untouched.
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
