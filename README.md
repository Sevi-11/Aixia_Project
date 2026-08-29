# Aixia — Personal RAG Chatbot

Aixia is a full-stack, locally-run chatbot that answers questions about a person's background (CV/resume) using Retrieval-Augmented Generation (RAG). It's built as a hands-on portfolio project to bridge classical ML/embedded engineering experience with modern LLM/RAG application development.

Ask it something like *"What machine learning experience do you have?"* and it retrieves the relevant, grounded facts from an uploaded document and streams back an answer token-by-token — refusing to answer, rather than guessing, when the information isn't present.

## Features

- 📄 **Document ingestion** — upload a PDF (e.g. a CV), automatically chunked and embedded
- 🔍 **Retrieval-Augmented Generation** — answers are grounded in retrieved context, not model memory
- ⚡ **Streaming responses** — answers stream back token-by-token over a chunked HTTP response, instead of waiting for the full generation
- 🧠 **Fast hosted LLM inference** — powered by Groq (`qwen/qwen3.6-27b`), with local embeddings (no LLM API key needed for retrieval itself)
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
| Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`), local, no API key required |
| Vector store | Chroma (persisted locally)                                               |
| LLM | Groq, running `qwen/qwen3.6-27b` (streaming)                             |
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

For local development, set `DJANGO_DEBUG=True` to opt into the local-only development secret fallback, then use either `DATABASE_URL` (a full `postgres://` URL) or the split variables `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` when `DATABASE_URL` is unset. LLM inference always goes through Groq — set `GROQ_API_KEY` and, optionally, `GROQ_MODEL` (defaults to `qwen/qwen3.6-27b`). `NEXT_PUBLIC_API_ORIGIN` should point to the Django API (falls back to `<current-hostname>:8000` in the browser if unset).

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
