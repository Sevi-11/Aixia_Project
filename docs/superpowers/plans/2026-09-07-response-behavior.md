# AIxia Response Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIxia answer as a concise, grounded assistant that speaks about Vince in the third person, opening every conversation with a static greeting that settles the naming question.

**Architecture:** Three independent changes. The answer prompt in `e_prompts.py` is rebuilt from named constants — halving it from 4,499 characters (~1,125 tokens) of formatting policy to 2,326 (~582) — so identity, naming, grounding, shape, and voice each live in a block that can be tuned alone. `get_llm()` in `f_chains.py` gains a per-call temperature so answers stay near-deterministic while follow-up suggestions and titles run hot. The frontend's empty state opens with a static greeting bubble instead of a hero headline.

**Tech Stack:** Django 5 / DRF, LangChain + `langchain-groq`, pytest + pytest-django, Next.js 16 (App Router, JavaScript — no TypeScript), React 19, plain CSS in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-07-response-behavior-design.md`

## Global Constraints

These apply to every task. Copy values exactly.

- **Name, default:** `Vince`. `Vince Viñas` is acceptable on a first or formal mention.
- **Name, full legal:** `Sean Vincent Vien V. Viñas` — used only when a question asks for his full or legal name, or when quoting a credential. Never suppressed entirely.
- **Name, forbidden:** `Sean` alone, in any user-facing copy or prompt, anywhere.
- **Voice:** AIxia speaks *about* Vince in the third person. It is never Vince. `"I"` means the assistant.
- **Citation contract (load-bearing, do not alter):** chunks are numbered `[1]`, `[2]`; citations are inline; multiple sources are written `[1][2]`, never `[1,2]`; no trailing "Sources" list. `_serialize_sources()` in `backend/apps/chat/b_views.py` and the `[n]` parser in `frontend/components/Markdown.js` both assume `sources[n-1]` is the chunk numbered `[n]`.
- **The greeting is static.** It never goes through the LLM, is never POSTed, never written to `ChatMessage`, and never enters the model's `history`.
- **Do not touch** `frontend/components/typingPacer.js` or `frontend/components/Markdown.js`.
- **Do not change** `ANSWER_MAX_TOKENS` (700 — a Groq free-tier ceiling) or the retrieval `k` (3).
- **No frontend test runner exists.** `package.json` has only `dev`, `build`, `start`, `lint`. Do not add jest, vitest, or playwright. Frontend verification is lint + build + a real browser check.
- **Backend tests run from `backend/`** and import as `rag.x` / `apps.chat.x` (see `backend/conftest.py`).

---

### Task 1: Per-call temperature

Answers must stay near-deterministic so they cannot drift from retrieved context, but not *at* zero — `ChatStreamView` with `regenerate=True` deletes the previous answer and asks again, and at temperature 0 the model returns the same text, which reads as a broken button. Suggestions and titles are the opposite problem: variety is the whole deliverable, and neither is grounded in retrieved context.

**Files:**
- Modify: `backend/apps/rag/f_chains.py:47-58` (constants and `get_llm`), `:152` and `:180` (the two extras call sites)
- Modify: `backend/.env.example:19-21`
- Modify: `README.md:198`
- Test: `backend/apps/rag/test_f_chains_temperature.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `f_chains.ANSWER_TEMPERATURE: float` (0.2), `f_chains.EXTRAS_TEMPERATURE: float` (0.7), and `get_llm(max_tokens: int = None, temperature: float = None) -> ChatGroq`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/rag/test_f_chains_temperature.py`:

```python
"""Temperature is per-call, not global.

Answers stay near-deterministic because this bot's credibility rests on not
drifting from the retrieved context. Suggestions and titles run hot because
variety is their entire job and neither is grounded in a document.
"""
import importlib
from unittest.mock import patch

import pytest

from rag import f_chains


@pytest.fixture(autouse=True)
def _fake_api_key():
    """ChatGroq validates a key at construction; the tests never call out."""
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key-not-used"}):
        yield


def test_get_llm_defaults_to_the_answer_temperature():
    assert f_chains.get_llm().temperature == f_chains.ANSWER_TEMPERATURE


def test_answer_temperature_is_above_zero_so_regenerate_can_differ():
    assert f_chains.ANSWER_TEMPERATURE > 0


def test_get_llm_honours_an_explicit_temperature():
    assert f_chains.get_llm(temperature=0.9).temperature == 0.9


def test_get_llm_honours_an_explicit_zero():
    # Guards the `if temperature is None` check. Written as `temperature or
    # ANSWER_TEMPERATURE`, an explicit 0 would be silently replaced by 0.2.
    assert f_chains.get_llm(temperature=0).temperature == 0


def test_extras_run_hotter_than_answers():
    assert f_chains.EXTRAS_TEMPERATURE > f_chains.ANSWER_TEMPERATURE


@pytest.mark.parametrize(
    "variable, constant",
    [
        ("GROQ_TEMPERATURE", "ANSWER_TEMPERATURE"),
        ("GROQ_EXTRAS_TEMPERATURE", "EXTRAS_TEMPERATURE"),
    ],
)
def test_environment_overrides_the_default(variable, constant):
    try:
        with patch.dict("os.environ", {variable: "0.42"}):
            reloaded = importlib.reload(f_chains)
            assert getattr(reloaded, constant) == 0.42
    finally:
        # Other test modules hold references into this module; leave the
        # process-wide defaults as they were found.
        importlib.reload(f_chains)
```

- [ ] **Step 2: Run the test and verify it fails**

Run from `backend/`:

```bash
pytest apps/rag/test_f_chains_temperature.py -v
```

Expected: FAIL — `AttributeError: module 'rag.f_chains' has no attribute 'ANSWER_TEMPERATURE'`.

- [ ] **Step 3: Add the constants**

In `backend/apps/rag/f_chains.py`, immediately after the `REASONING_EFFORT` block:

```python
# Answers stay near-deterministic: this bot's credibility rests on not drifting
# from the retrieved context. Not zero, though -- ChatStreamView's regenerate
# path deletes the previous answer and asks the same question again, and at 0
# the model returns the same text, which reads as a broken button.
ANSWER_TEMPERATURE = float(os.getenv("GROQ_TEMPERATURE", "0.2"))

# Follow-up suggestions and conversation titles are the opposite problem:
# variety IS the deliverable, and neither is grounded in retrieved context, so
# there is nothing for a higher temperature to drift away from.
EXTRAS_TEMPERATURE = float(os.getenv("GROQ_EXTRAS_TEMPERATURE", "0.7"))
```

- [ ] **Step 4: Give `get_llm` the parameter**

Replace the existing `get_llm` with:

```python
def get_llm(max_tokens: int = None, temperature: float = None):
    kwargs = {}
    if REASONING_EFFORT:
        kwargs["reasoning_effort"] = REASONING_EFFORT
    return ChatGroq(
        model=os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        # `is None`, not `or`: an explicit 0 is a legitimate request for full
        # determinism and must not be quietly replaced by the default.
        temperature=ANSWER_TEMPERATURE if temperature is None else temperature,
        max_tokens=max_tokens or ANSWER_MAX_TOKENS,
        **kwargs,
    )
```

- [ ] **Step 5: Pass the hot temperature at the two extras call sites**

In `generate_followup_suggestions`, change:

```python
    llm = llm or get_llm(SUGGESTION_MAX_TOKENS)
```

to:

```python
    llm = llm or get_llm(SUGGESTION_MAX_TOKENS, EXTRAS_TEMPERATURE)
```

In `generate_title`, change:

```python
    llm = llm or get_llm(TITLE_MAX_TOKENS)
```

to:

```python
    llm = llm or get_llm(TITLE_MAX_TOKENS, EXTRAS_TEMPERATURE)
```

Leave `answer_question` and `answer_question_stream` calling bare `get_llm()` — they take the answer default.

- [ ] **Step 6: Run the test and verify it passes**

```bash
pytest apps/rag/test_f_chains_temperature.py -v
```

Expected: PASS, 7 passed.

- [ ] **Step 7: Run the full backend suite for regressions**

```bash
pytest -q
```

Expected: all pass. `test_f_chains_stream.py` passes explicit fake LLMs and never reaches `get_llm`, so it is unaffected.

- [ ] **Step 8: Document the two variables**

In `backend/.env.example`, replace the `# Chat model.` block with:

```
# Chat model.
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=qwen/qwen3.6-27b
# Answer sampling. Low but non-zero: high enough that "regenerate" produces a
# genuinely different phrasing, low enough that answers stay tied to the
# retrieved documents. Set to 0 for full determinism.
GROQ_TEMPERATURE=0.2
# Follow-up suggestions and conversation titles, where variety is the point.
GROQ_EXTRAS_TEMPERATURE=0.7
```

In `README.md:198`, extend the sentence that begins "LLM inference always goes through Groq" by appending:

```
Two optional knobs control sampling: `GROQ_TEMPERATURE` (answers, default `0.2`) and `GROQ_EXTRAS_TEMPERATURE` (follow-up suggestions and conversation titles, default `0.7`).
```

- [ ] **Step 9: Commit**

```bash
git add backend/apps/rag/f_chains.py backend/apps/rag/test_f_chains_temperature.py backend/.env.example README.md
git commit -m "feat: give answers and extras separate sampling temperatures

Answers move off temperature 0, which made regenerate hand back the same
text it had just produced. Suggestions and titles move to 0.7, where
variety is the deliverable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rebuild the answer prompt

The current prompt is a general-purpose Markdown manual attached to a portfolio bot: 4,499 characters (~1,125 tokens) of formatting policy governing a 700-token answer budget, with the persona reduced to one clause. It authorises headings, checklists, and nested tables that a background-questions bot will never need, and says nothing about which of Vince's three names to use.

**Files:**
- Modify: `backend/apps/rag/e_prompts.py` (replace `context_prompt` entirely; rename in `suggestions_prompt`)
- Test: `backend/apps/rag/test_e_prompts.py` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `e_prompts.context_prompt` with input variables `{history, context, question}` — unchanged from today, so `f_chains._retrieve_and_build_chain_input` needs no edit. New module-level constants `IDENTITY`, `NAMES`, `GROUNDING`, `SHAPE`, `VOICE`, `CITATIONS` (all `str`).

- [ ] **Step 1: Write the failing test**

Create `backend/apps/rag/test_e_prompts.py`:

```python
"""The answer prompt is a behaviour contract.

These assert the parts other code depends on, so a future tone edit cannot
silently break retrieval wiring or the sources panel.
"""
from rag.e_prompts import context_prompt, suggestions_prompt


def _rendered():
    return context_prompt.format(history="H", context="[1] C", question="Q")


def test_template_still_accepts_the_three_chain_inputs():
    # _retrieve_and_build_chain_input passes exactly these three.
    assert set(context_prompt.input_variables) == {"history", "context", "question"}


def test_prompt_keeps_the_inline_citation_contract():
    rendered = _rendered()

    assert "[1][2], not [1,2]" in rendered
    assert '"Sources" or "References" list' in rendered


def test_prompt_names_him_vince():
    assert 'Call him "Vince"' in _rendered()


def test_prompt_forbids_the_family_name_as_an_address_form():
    assert 'Never call him "Sean" on its own' in _rendered()


def test_prompt_keeps_the_full_legal_name_reachable():
    # Suppressing it entirely would make "what is his full name?" unanswerable.
    assert "Sean Vincent Vien V. Viñas" in _rendered()


def test_prompt_speaks_about_vince_rather_than_as_him():
    # Kept to one line of the source block -- the sentence that follows it
    # wraps, and a substring assertion cannot span the newline.
    assert "You speak ABOUT Vince, always in the third person." in _rendered()


def test_prompt_requires_an_answer_first_opening():
    assert "Open with one sentence that answers the question directly" in _rendered()


def test_prompt_forbids_headings():
    assert "Do not use headings." in _rendered()


def test_prompt_tells_a_miss_to_redirect_rather_than_dead_end():
    assert "Name one or two subjects the Context does cover" in _rendered()


def test_prompt_is_proportionate_to_the_answer_budget_it_governs():
    # Measured: the old policy rendered to 4,499 characters (~1,125 tokens at
    # roughly four characters per token) to govern a 700-token answer budget.
    # The replacement measures 2,326 (~582). The ceiling here is a ratchet
    # against the formatting menu creeping back, not a tight fit.
    assert len(_rendered()) / 4 < 700


def test_suggestions_prompt_uses_the_professional_name():
    rendered = suggestions_prompt.format(history="H", question="Q", answer="A")

    assert "Vince" in rendered
    assert "Sean" not in rendered
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pytest apps/rag/test_e_prompts.py -v
```

Expected: FAIL — several assertions, including `Call him "Vince"` not present and the length check, since the current prompt is far over budget.

- [ ] **Step 3: Replace the prompt**

Replace everything in `backend/apps/rag/e_prompts.py` from the `context_prompt = ...` assignment down to (but not including) `suggestions_prompt`, with:

```python
# The behaviour contract is assembled from named blocks rather than written as
# one literal, so changing the tone is a three-line diff in one block instead
# of a hunt through sixty lines of prose.

IDENTITY = """
You are AIxia, an AI assistant that answers questions about Vince's
professional background. Your readers are recruiters, hiring managers, and
technical interviewers evaluating him.

You speak ABOUT Vince, always in the third person. You are not Vince and never
write as him. "I" refers to you, the assistant, never to Vince.
"""

# He has three names and they belong to different registers. The retrieved
# documents lead with the legal one, and a model will happily adopt whatever
# the context hands it, so the rule has to be stated rather than assumed.
NAMES = """
Call him "Vince". You may write "Vince Viñas" on a first or formal mention.
Give his full legal name -- Sean Vincent Vien V. Viñas -- only when the
question actually asks for his full or legal name, or when you are quoting a
document that presents it as a credential.

Never call him "Sean" on its own, and never adopt a longer form of his name
from the Context as your way of referring to him.
"""

GROUNDING = """
Answer only from the numbered Context below. Never invent, infer beyond, or
embellish it.

When the Context does not answer the question:
1. Say plainly that it is not in what you have on Vince.
2. Name one or two subjects the Context does cover, and offer them.

Do not guess, and do not soften a miss into a vague half-answer.
"""

SHAPE = """
Open with one sentence that answers the question directly. No preamble, no
restating the question, no "Great question".

Add supporting detail only when it adds something:
- prose for reasoning, narrative, or context
- a bulleted list for three or more parallel items
- a Markdown table only when comparing two or more things across the same
  attributes

Default to two to four sentences. Do not use headings. Do not pad an answer to
look thorough.
"""

VOICE = """
Plain, precise, professional. Contractions are fine. No corporate filler
("leverage", "passionate about", "wealth of experience"). No exclamation
marks, no flattery, no closing offer of further help.
"""

# Load-bearing. _serialize_sources() in apps/chat/b_views.py and the [n] parser
# in frontend/components/Markdown.js both assume sources[n-1] is the chunk
# numbered [n]. Renumbering, a trailing "Sources" list, or [1,2] in place of
# [1][2] each break the sources panel.
CITATIONS = """
The Context is split into numbered chunks like `[1] ...`, `[2] ...`.

When a statement in your answer comes from a specific chunk, cite it inline
immediately after that sentence, e.g. `Vince has 5 years of ML experience [1].`

- Only cite chunk numbers that actually appear in the Context below.
- Use the exact numbers shown. Do not renumber or invent them. For multiple
  sources write [1][2], not [1,2].
- Do not cite a chunk for information it does not support.
- Do not add a "Sources" or "References" list at the end. Citations are inline
  only.
"""

# The doubled braces survive the f-string and reach ChatPromptTemplate as the
# single braces it treats as placeholders. None of the blocks above may contain
# a literal brace, or it would be parsed as one.
context_prompt = ChatPromptTemplate.from_template(
    f"""{IDENTITY}
{NAMES}
{GROUNDING}
{SHAPE}
{VOICE}
{CITATIONS}
Conversation so far:
{{history}}

Context:
{{context}}

Question:
{{question}}

Answer:
"""
)
```

Deleted along with the old template: the heading-hierarchy rules, the checklist section, the table-width guidance, the general Markdown preamble, and `DO NOT INCLUDE YOUR THINKING PROCESS` — that last already covered three times over by `REASONING_EFFORT="none"`, `_strip_thinking()`, and `strip_thinking_stream()`.

- [ ] **Step 4: Rename in the suggestions prompt**

In the same file, in `suggestions_prompt`, change:

```
propose 2 to 3 short natural follow-up questions the user might ask next about Sean's background.
```

to:

```
propose 2 to 3 short natural follow-up questions the user might ask next about Vince's background.
```

- [ ] **Step 5: Run the test and verify it passes**

```bash
pytest apps/rag/test_e_prompts.py -v
```

Expected: PASS, 11 passed.

- [ ] **Step 6: Run the full backend suite**

```bash
pytest -q
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/rag/e_prompts.py backend/apps/rag/test_e_prompts.py
git commit -m "feat: rebuild the answer prompt around identity, naming and shape

Halves the prompt, from ~1,125 tokens of general-purpose Markdown policy to
~582 tokens of behaviour contract: answer-first, third person about Vince,
decline and redirect on a miss. The citation block is kept verbatim -- the
sources panel depends on it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Static greeting bubble

Every conversation opens with AIxia introducing itself and settling which name it will use, matching `aixia-chat-mockup.html:646` where the canonical opening is AIxia speaking rather than a hero headline.

The greeting is deliberately **not** a `MessageRow` and **not** an entry in the `messages` array. `MessageRow` renders copy, regenerate, and thumb actions on every assistant message; regenerating canned text is meaningless, and rating it is noise. Keeping the greeting out of `messages` is also what structurally guarantees it can never be POSTed, persisted, or padded into the model's history — it is not a message, so no code path can treat it as one.

**Files:**
- Create: `frontend/components/GreetingBubble.js`
- Modify: `frontend/components/ChatWindow.js:31-44` (starter copy), `:515-527` (empty state), and the import block at the top
- Modify: `frontend/app/globals.css:1037-1043`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: default export `GreetingBubble()` — a component taking no props and holding no state.

- [ ] **Step 1: Create the component**

Create `frontend/components/GreetingBubble.js`:

```jsx
"use client";

/*
 * The opening bubble. Static copy, never a model call: generating it would
 * spend free-tier answer budget before the visitor has asked anything, add
 * latency ahead of the first real reply, and reword itself every session.
 *
 * Deliberately NOT a MessageRow and NOT an entry in the messages array.
 * MessageRow puts copy/regenerate/feedback actions on every assistant
 * message, and regenerating canned text is meaningless. Staying out of
 * `messages` is also what guarantees this can never be POSTed to /chat/stream,
 * written to ChatMessage, or padded into the model's history -- it is not a
 * message, so nothing can treat it as one.
 *
 * Reuses the message-row classes so it is visually identical to a real reply,
 * and is born `is-visible` rather than waiting on the IntersectionObserver
 * reveal: there is nothing to stream, so there is nothing to wait for.
 */
export default function GreetingBubble() {
  return (
    <div className="msg-row ai reveal is-visible">
      <div className="msg-avatar" aria-hidden="true">Æ</div>
      <div className="bubble-stack">
        <div className="bubble">
          <p>
            Hi, I&apos;m AIxia — assistant to Vince Viñas (Sean Vincent Vien V.
            Viñas on paper; he goes by Vince).
          </p>
          <p>
            Ask me anything about his background, skills, or projects. I answer
            from his CV and notes, with sources you can check.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Import it in ChatWindow**

In `frontend/components/ChatWindow.js`, add to the existing component imports near the top of the file:

```jsx
import GreetingBubble from "./GreetingBubble";
```

- [ ] **Step 3: Fix the starter prompts that use the family name**

In `STARTER_POOL`, two of the twelve entries use "Sean". Change:

```jsx
  "What is Sean's machine learning experience?",
```

to:

```jsx
  "What is Vince's machine learning experience?",
```

and:

```jsx
  "What projects has Sean worked on?",
```

to:

```jsx
  "What projects has Vince worked on?",
```

Leave the other ten unchanged — they already say "he"/"his".

- [ ] **Step 4: Replace the empty state**

The hero headline and paragraph say what the greeting bubble now says, more directly. Replace:

```jsx
                <div className="empty-hero">
                  <h1>Ask me anything about <em>Vince</em></h1>
                  <p>I answer from his CV, projects and notes — grounded in the documents, with the sources you can check.</p>
                  <div className="starter-grid">
```

with:

```jsx
                <>
                  <GreetingBubble />
                  <div className="empty-hero">
                    <div className="starter-grid">
```

and close it correspondingly — the block that currently reads:

```jsx
                    ))}
                  </div>
                </div>
              ) : (
```

becomes:

```jsx
                      ))}
                    </div>
                  </div>
                </>
              ) : (
```

Re-indent the `starters.map(...)` body one level to match. The starter cards stay: they are an app-only feature with a rotation pool and no equivalent in the mockup, and dropping them is not part of this change.

- [ ] **Step 5: Reclaim the hero's top padding**

The hero's `3rem` top padding existed to give the headline room. With only the starter grid left, and the greeting bubble sitting above it, that gap is now dead space. In `frontend/app/globals.css`, change:

```css
.empty-hero { text-align: center; padding: 3rem 1rem 1rem; animation: fade-up var(--medium) backwards; }
```

to:

```css
/* Holds the starter grid only; the greeting bubble above it now carries the
   introduction that used to be an h1 here. */
.empty-hero { text-align: center; padding: 0.5rem 1rem 1rem; animation: fade-up var(--medium) backwards; }
```

Leave the now-unused `.empty-hero h1`, `.empty-hero h1 em`, and `.empty-hero p` rules in place — they are three inert lines, and removing them is unrelated churn.

- [ ] **Step 6: Lint and build**

Run from `frontend/`:

```bash
npm run lint
```

Expected: no errors. A raw `'` in JSX text trips `react/no-unescaped-entities`; the component above already uses `&apos;`.

```bash
npm run build
```

Expected: build completes.

- [ ] **Step 7: Verify in a browser**

Start the backend (from the project root) and the frontend dev server:

```bash
docker compose up -d --build backend
```

```bash
npm run dev -- -p 3210
```

Open `http://localhost:3210` and confirm:
- The greeting bubble appears immediately, with the `Æ` avatar, left-aligned like a real assistant reply.
- No copy, regenerate, or thumb buttons on it.
- The three starter cards sit below it with no large gap where the headline used to be.
- Both light and dark mode render the bubble correctly (toggle in the header).
- At a phone width (375px) the bubble wraps and the starter strip still scrolls as one row.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/GreetingBubble.js frontend/components/ChatWindow.js frontend/app/globals.css
git commit -m "feat: open each conversation with a static greeting bubble

Replaces the hero headline with AIxia introducing itself and naming which
of Vince's names it will use, matching the mockup's opening. Static copy,
never a model call, never a message -- so it cannot be sent, stored, or
padded into history.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end behaviour check

The previous three tasks are verified by unit tests and a build. None of them proves the model actually *behaves* differently — that only shows up against a real Groq call and the real document corpus.

**Files:** none modified. This task produces a written result, and a fix or a follow-up issue if anything fails.

**Interfaces:**
- Consumes: all of Tasks 1–3.
- Produces: a pass/fail note per check below.

- [ ] **Step 1: Restart the backend so it picks up the new prompt**

The backend runs in Docker and does not hot-reload prompt modules:

```bash
docker compose up -d --build backend
```

- [ ] **Step 2: Serve the frontend**

```bash
npm run dev -- -p 3210
```

- [ ] **Step 3: Run the seven checks at `http://localhost:3210`**

Record the actual answer text for each.

| # | Ask | Passes when |
|---|---|---|
| 1 | "What does he use day to day — languages, frameworks, tools?" | Opens with a direct sentence; uses a bulleted list only if there are 3+ tools; no heading |
| 2 | "Tell me about Vince" | Prose, 2–4 sentences, no bullets, no heading |
| 3 | "Compare his backend and frontend experience" | Produces a list or table rather than a wall of prose |
| 4 | Press **regenerate** on any answer | Returns visibly different wording, not the same text |
| 5 | "What salary is he looking for?" | Declines plainly, then names one or two subjects it *can* cover |
| 6 | "Does he know Rust?" (assuming absent from the corpus) | Declines and redirects; does **not** invent experience |
| 7 | "What's his full name?" | Returns `Sean Vincent Vien V. Viñas` — while every other answer in the session still says "Vince" |

- [ ] **Step 4: Confirm the greeting never leaves the browser**

With DevTools open on the Network tab, send one question. Inspect the `/api/chat/stream/` request payload and confirm the greeting text appears nowhere in it. Then open the Django admin at `http://localhost:8001/admin/` → Chat messages, and confirm no row was written containing the greeting.

- [ ] **Step 5: Confirm citations still work**

On any answer carrying `[1]`-style markers, click a citation pill and confirm the sources panel opens on the matching chunk. This is the regression that matters most — the citation block was carried over verbatim precisely to protect it.

- [ ] **Step 6: Report**

State which of the seven checks passed and which did not, quoting the failing answer verbatim.

If check 4 fails (regenerate still identical), raise `GROQ_TEMPERATURE` to `0.35` and retest.

If checks 5 or 6 fail by inventing information, lower `GROQ_TEMPERATURE` to `0.1` and retest; if it still invents, that is a grounding problem in the prompt, not the temperature — report it rather than tuning further.

If check 7 shows the model drifting to "Sean" as an address form in other answers, apply the spec's fallback ladder: tighten the `NAMES` block first; if that fails, normalise the display name at ingestion so the retrieved chunks themselves say "Vince".

---

## Notes for the executor

- **Task order matters only for Task 4**, which needs the other three. Tasks 1, 2, and 3 touch disjoint files and can be done in any order.
- **Do not "helpfully" reduce `ANSWER_MAX_TOKENS`** because answers are now shorter. The 700 ceiling is a reservation against a Groq free-tier per-minute cap, not a target length; lowering it saves nothing and truncates the occasional long answer.
- **Do not add a frontend test framework** to cover Task 3. There is deliberately none in this repo, and adding one is a separate decision.
