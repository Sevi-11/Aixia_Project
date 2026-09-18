# AGENTS.md

Aixia is a grounded RAG chatbot about one person, with a second ungrounded mode
and a voice surface. `README.md` carries the architecture, the stack, the
environment variables and the setup; read it rather than re-deriving them here.

This file carries only what the repository cannot tell you by looking.

## What the product is

**Grounding is the product.** Grounded mode answers from retrieved context,
cites `[n]`, and says plainly when the context does not cover the question.
That refusal is the demo, not an edge case — changes that make answers more
fluent at the cost of the refusal are regressions. `apps/rag/test_e_prompts.py`
guards the prompt contract.

`mode` defaults to `grounded` everywhere. An omitted mode always means
grounded, so an older client never starts receiving unsourced claims about a
real person.

## Conventions

- **`a_`, `b_`, `c_` prefixes order files by pipeline position**, not by type:
  `a_loader` → `b_splitter` → `c_embeddings` → `d_vectorstore` → `e_prompts` →
  `f_chains`. A new file takes the letter of its place in the flow.
- **`apps/rag/` stays Django-free.** It is a plain package so it can be tested
  outside the web layer; keep imports of Django out of it.
- **The frontend is hand-rolled.** No UI or Markdown libraries. `Markdown.js`
  exists because `[n]` markers become buttons wired to the sources panel, and
  because it renders mid-stream, so every branch tolerates a half-written
  document. Extend it rather than reaching for a library.
- **`aixia-chat-mockup.html` at the repo root is the authoritative design.**
  Match it; deviations are deliberate and worth stating in the commit.

## Gotchas that cost hours

- **Restart the backend after editing it.** gunicorn runs without `--reload`,
  so a request against stale code returns a cheerful 200:
  `docker compose restart backend`.
- **Clear `.next` when appended CSS does not apply.** Turbopack serves a stale
  chunk: the rules compile without error, HMR reports success, and the new
  selectors are simply absent from the CSSOM while older ones are present.
  Confirm with a CSSOM query for your class, then `rm -rf frontend/.next` and
  restart. This presents as a specificity bug and is not one.
- **The frontend dev server is port 3210**, and it needs `frontend/.env.local`
  with `BACKEND_INTERNAL_URL=http://localhost:8001`. Port 3000 is the
  containerised build and goes stale.
- **Test runners are split.** `manage.py test chat` works. `rag` and
  `documents` import pytest, which is deliberately absent from the production
  image, so they error under the Django runner — run them with pytest instead.
- **`/healthz/` never touches the database.** A green healthz beside a failing
  chat request is the signature of a bad `DATABASE_URL`, not a healthy service.

## Decisions that look like bugs

Each of these has cost someone an afternoon. Change them knowingly.

- **Reasoning tokens are billed against the output cap.** Both providers do
  this: `REASONING_EFFORT="none"` for qwen on Groq, `thinking_budget=0` for
  Gemini. Left on, a model spends its allowance thinking and the reply stops
  mid-sentence with `finish_reason=MAX_TOKENS` — nothing raises, nothing logs.
  Raising a thinking budget means raising the token ceiling with it.
- **Xia is abstract on purpose.** `speechSynthesis` renders straight to the
  audio device and cannot be routed into Web Audio for an amplitude envelope,
  and its `boundary` event is unreliable outside Chrome — so lip-sync is not
  available and a face would promise what it cannot do. The sigil needs only
  start and end.
- **Speech recognition is absent in some Chromium browsers.** Brave, Opera and
  Arc expose `SpeechRecognition` but ship without Google's speech key, so every
  attempt fails with `network`. Detection by `typeof SpeechRecognition` is
  therefore wrong; a `network` error is treated as fatal and withdraws the mic.
- **The Django admin is proxied through Next**, and the rewrite re-adds the
  trailing slash. Admin served from the backend's own domain sets a host-only
  cookie the browser never sends to the frontend origin, so uploads stay 403
  however often you sign in. Without the trailing slash, APPEND_SLASH folds the
  query into its own `?next=` and the login URL grows on every redirect.
  `CSRF_TRUSTED_ORIGINS` must carry the frontend origin for any of it to work.

## Finishing work

Run the narrowest relevant checks, then the broader ones: `manage.py test chat`
for backend behaviour, `npx eslint .` and `npm run build` in `frontend/` for the
UI. The build is where hydration mismatches surface.

**Then run it.** Start the dev server and drive the actual change in the browser
— tests passing is not evidence that a feature works. State which checks ran and
which were skipped.

When rotating any credential, verify the **old** one is now rejected. Confirming
that the service still works proves nothing: it works whether or not anything
rotated.
