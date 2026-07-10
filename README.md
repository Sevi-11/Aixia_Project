# Aixia — Personal RAG Chatbot

Aixia is a full-stack, locally-run chatbot that answers questions about a person's background (CV/resume) using Retrieval-Augmented Generation (RAG). It's built as a hands-on portfolio project to bridge classical ML/embedded engineering experience with modern LLM/RAG application development.

Ask it something like *"What machine learning experience do you have?"* and it retrieves the relevant, grounded facts from an uploaded document and answers using a locally-hosted LLM — refusing to answer, rather than guessing, when the information isn't present.

## Features

- 📄 **Document ingestion** — upload a PDF (e.g. a CV), automatically chunked and embedded
- 🔍 **Retrieval-Augmented Generation** — answers are grounded in retrieved context, not model memory
- 🧠 **Local LLM inference** — powered by Ollama running `qwen3.5:9b`, no external API calls or costs
- 💬 **Session-aware chat** — conversations persist across turns via a session ID
- 📎 **Source citation** — every answer includes which document chunk(s) it was grounded in
- 🚫 **Hallucination guardrails** — the model is explicitly instructed to say "I don't have that information" rather than fabricate an answer

## Tech Stack

| Layer | Technology                                                               |
|---|--------------------------------------------------------------------------|
| Frontend | Next.js |                                                           |
| Backend | Python, Django, Django REST Framework                                    |
| Database | PostgreSQL                                                               |
| RAG orchestration | LangChain                                                                |
| Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`), local, no API key required |
| Vector store | Chroma (persisted locally)                                               |
| LLM | Ollama, running `qwen3.5:9b`                                             |
| QA / Testing | pytest, Playwright, Locust, RAGAS                                        |

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
                                                   │Ollama qwen3.5:9b│
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
│   │   ├── b_views.py
│   │   └── c_urls.py
│   └── rag/                    # Standalone RAG pipeline (plain Python, no Django deps)
│       ├── a_loader.py          # PDF loading
│       ├── b_splitter.py         # Chunking
│       ├── c_embeddings.py        # Local embedding model
│       ├── d_vectorstore.py        # Chroma build / load / add / search
│       ├── e_prompts.py             # Grounding prompt template
│       └── f_chains.py               # Retrieval + generation chain (Ollama)
├── data/                     # Chroma persistence (gitignored)
├── media/                    # Uploaded files (gitignored)
└── manage.py

frontend/
├── app/
│   ├── layout.js
│   └── page.js              # renders ChatWindow
├── components/
│   └── ChatWindow.js          # chat UI: message list, input, sources display
└── package.json
qa/                           # Playwright, Locust, RAGAS (planned)
docs/                          # PRD, architecture notes, ADRs (planned)
```

## Prerequisites

- Python 3.11+
- PostgreSQL, running locally
- [Ollama](https://ollama.com), with the model pulled:
  ```bash
  ollama pull qwen3.5:9b
  ```
  Recommended: 16GB RAM (8GB may work but will be slow), ~10-15GB free disk space.

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
   ```

4. **Run migrations:**
   ```bash
   python manage.py migrate
   ```

5. **Start Ollama** (in a separate terminal, if not already running as a service):
   ```bash
   ollama serve
   ```

6. **Start the Django server:**
   ```bash
   python manage.py runserver
   ```
7. **Enable CORS for local frontend access** — install and configure `django-cors-headers` (see Design Decisions below).

8. **Start the frontend** (in a separate terminal):
```bash
   cd frontend
   npm install
   npm run dev
```
   Visit `http://localhost:3000`.

## Usage

**Upload a document:**
```bash
curl -X POST http://127.0.0.1:8000/api/documents/upload/ -F "file=@path/to/cv.pdf"
```

**Trigger ingestion** (chunk, embed, store):
```bash
curl -X POST http://127.0.0.1:8000/api/documents/<document_id>/ingest/
```

**Ask a question:**
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

## Design Decisions

A few choices worth calling out (fuller reasoning to live in `docs/adr/` as the project matures):

- **Chroma over FAISS** — chosen for built-in disk persistence and metadata handling, at the cost of slightly more dependencies. Not a hardware/performance decision; both are lightweight enough for local use.
- **Local embeddings (`all-MiniLM-L6-v2`) over an API-based embedding service** — free, no external calls, small enough to not compete with the LLM for resources.
- **`rag/` kept fully decoupled from Django** — the retrieval/generation logic has no framework dependency, so it can be tested and iterated on independently of the web layer.
- **Local LLM (Ollama) for development** — for any future public-facing demo deployment, local Ollama won't be reachable, so a free-tier hosted LLM API would be swapped in for that specific deployment while local development continues to use Ollama.
- **CORS via `django-cors-headers`** — Next.js dev server (`localhost:3000`) and Django (`127.0.0.1:8000`) are different origins; the browser blocks cross-origin requests by default, so `CORS_ALLOWED_ORIGINS` explicitly permits the frontend's origin.

## Roadmap

- [x] Standalone RAG pipeline (load → split → embed → store → retrieve → generate)
- [x] Django + PostgreSQL integration
- [x] Document upload + ingestion API
- [x] Session-aware chat API
- [x] Multi-turn conversational context (follow-up questions aware of chat history)
- [x] Next.js frontend
- [ ] QA suite: pytest, Playwright E2E, Locust load testing
- [ ] RAGAS-based retrieval/faithfulness evaluation
- [ ] Free-tier deployment (frontend + backend + hosted Postgres w/ pgvector)
- [ ] Optional: air quality sensor data (AeroBand project) as a second retrieval domain

## License

Personal portfolio project. All rights reserved unless stated otherwise.
