# Aixia Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Aixia as a durable Vercel + Render + Neon application with Groq-hosted inference and Ollama preserved for local development.

**Architecture:** Vercel serves the Next.js frontend and sends HTTPS requests to a Render Django web service. Render connects to Neon Postgres through a pooled `DATABASE_URL`; relational chat data and vector embeddings live in Neon, while document files use durable object storage or a deliberate seeded-document strategy. The LLM provider is selected by environment: Ollama locally, Groq in production.

**Tech Stack:** Next.js 16, Vercel, Django/DRF, Render Web Service, Neon Postgres, PostgreSQL `pgvector`, LangChain, Ollama locally, Groq remotely, Gunicorn/Uvicorn, WhiteNoise.

**Spec:** `docs/superpowers/specs/2026-08-17-deployment-design.md`

## Global Constraints

- Keep Ollama working for local development.
- Never commit API keys, database URLs, Django secrets, uploaded documents, or vector-store data.
- Production must not depend on Render's ephemeral filesystem.
- Use environment variables for all provider URLs, credentials, model IDs, and allowed origins.
- Preserve grounded-answer behavior and source citations.
- Use the smallest provider abstraction that supports Ollama and Groq; do not add a general agent framework.

---

### Task 1: Add deployment dependency and configuration inventory

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Modify: `backend/config/settings.py`
- Modify: `README.md`

**Interfaces:**
- Produces the dependency and environment contract consumed by all later deployment tasks.

- [ ] **Step 1: Inventory imports and write the dependency file**

List the runtime packages imported by Django, DRF, CORS, PostgreSQL, LangChain, Chroma/pgvector migration tooling, embeddings, Ollama, Groq, Gunicorn, Uvicorn, and static-file serving. Pin compatible major versions after checking the installed environment; do not copy the entire local environment.

- [ ] **Step 2: Add the environment template**

Document these keys without real values:

```dotenv
DJANGO_SECRET_KEY=
DJANGO_DEBUG=True
DATABASE_URL=
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:8000
```

- [ ] **Step 3: Make settings environment-driven**

Replace the source-controlled secret and hard-coded debug/database values with parsed environment variables. Support the existing split `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT` local variables as a compatibility fallback, while preferring `DATABASE_URL` in deployment. Parse comma-separated host and CORS lists.

- [ ] **Step 4: Document local and production configuration**

Add a short README section explaining which variables are local-only, which are required on Render/Vercel, and that `.env.example` is a template.

- [ ] **Step 5: Run the configuration checks**

Run:

```powershell
python backend/manage.py check
python -m pip check
```

Expected: both commands exit successfully.

- [ ] **Step 6: Commit**

```powershell
git add backend/requirements.txt backend/.env.example backend/config/settings.py README.md
git commit -m "chore: define deployment configuration contract"
```

### Task 2: Add production-safe Django serving and health checks

**Files:**
- Create: `backend/build.sh`
- Create: `backend/apps/core/apps.py`
- Create: `backend/apps/core/urls.py`
- Modify: `backend/config/settings.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Produces `GET /health/` returning HTTP 200 when the process is alive.
- Produces a Render build command that installs dependencies, collects static files, and runs migrations.

- [ ] **Step 1: Write the health endpoint test**

Add a Django test asserting `GET /health/` returns `200` and a small JSON body such as `{ "status": "ok" }`.

- [ ] **Step 2: Run the test and confirm it fails**

Run `python backend/manage.py test backend.apps.core -v 2`. Expected: URL/app does not yet exist.

- [ ] **Step 3: Implement the health app and URL**

Return a 200 JSON response without invoking Ollama or the vector store. Add the app and route at `/health/`.

- [ ] **Step 4: Configure production static files**

Add WhiteNoise immediately after Django `SecurityMiddleware`, define `STATIC_ROOT`, and keep media handling explicit rather than pretending local uploads are durable.

- [ ] **Step 5: Add the Render build script**

Use a POSIX shell script that runs `pip install -r requirements.txt`, `python manage.py collectstatic --noinput`, and `python manage.py migrate` with `set -e`.

- [ ] **Step 6: Run tests and checks**

Run the health test, `python backend/manage.py check --deploy`, and verify `build.sh` has executable permissions in git.

- [ ] **Step 7: Commit**

```powershell
git add backend/build.sh backend/apps/core backend/config/settings.py backend/config/urls.py backend/tests
git commit -m "feat: prepare Django API for production serving"
```

### Task 3: Abstract Ollama and Groq behind one provider interface

**Files:**
- Create: `backend/apps/rag/g_llm.py`
- Modify: `backend/apps/rag/f_chains.py`
- Modify: `backend/apps/rag/e_prompts.py` only if provider-neutral prompt changes are required
- Create: `backend/apps/rag/tests/test_llm.py`

**Interfaces:**
- `get_llm()` reads `LLM_PROVIDER` and returns the configured LangChain chat model.
- `LLM_PROVIDER=ollama` uses `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
- `LLM_PROVIDER=groq` uses `GROQ_API_KEY` and `GROQ_MODEL`.
- `answer_question()` remains provider-neutral and continues returning `(answer, retrieved_docs)`.

- [ ] **Step 1: Write failing provider-selection tests**

Test that Ollama configuration selects `ChatOllama`, Groq configuration selects `ChatGroq`, and an unsupported provider raises a clear configuration error. Patch constructors only; never call a paid/free external API in unit tests.

- [ ] **Step 2: Run tests to confirm failure**

Run `pytest backend/apps/rag/tests/test_llm.py -v`. Expected: the provider module or selection behavior is missing.

- [ ] **Step 3: Implement the minimal factory**

Use environment variables and the existing prompt/chain. Add `langchain-groq` to requirements. Do not leak API keys in exceptions or logs.

- [ ] **Step 4: Add provider error handling**

Map missing credentials and provider rate-limit failures to clear backend errors. Preserve the existing grounded refusal prompt.

- [ ] **Step 5: Run tests and local smoke tests**

Run the provider unit tests and one Ollama-backed chat smoke test with `LLM_PROVIDER=ollama`.

- [ ] **Step 6: Commit**

```powershell
git add backend/apps/rag/g_llm.py backend/apps/rag/f_chains.py backend/apps/rag/tests backend/requirements.txt
git commit -m "feat: support configurable Ollama and Groq providers"
```

### Task 4: Move vector retrieval from local Chroma files to Neon pgvector

**Files:**
- Create: `backend/apps/rag/vector_models.py`
- Create: `backend/apps/rag/vector_store.py`
- Create: `backend/apps/rag/management/commands/rebuild_vectors.py`
- Create: `backend/apps/rag/tests/test_vector_store.py`
- Modify: `backend/apps/documents/b_services.py`
- Modify: `backend/apps/rag/f_chains.py`
- Modify: `backend/config/settings.py`
- Create: `backend/migrations/` files as generated by Django

**Interfaces:**
- `rebuild_vectors` ingests the configured seed/upload documents and writes embeddings to Neon.
- Retrieval returns LangChain `Document` objects with `page_content`, `document_id`, and `original_filename` metadata.
- No runtime code reads `backend/data/chroma_db` in production.

- [ ] **Step 1: Enable pgvector in a Neon database**

Run `CREATE EXTENSION IF NOT EXISTS vector;` in Neon and record the pooled `DATABASE_URL` for the Render service.

- [ ] **Step 2: Write failing retrieval tests**

Test storing a document chunk with an embedding and retrieving the nearest result while preserving source metadata. Use a test database or a fake repository for unit tests, plus one opt-in Neon integration test.

- [ ] **Step 3: Implement the vector model/repository**

Use the existing `all-MiniLM-L6-v2` embedding dimension, store chunk text, document metadata, and vector values, and expose a small similarity-search function. Keep the repository independent from Django views.

- [ ] **Step 4: Add the rebuild command**

Make rebuilding explicit and repeatable; clear/rebuild only the target document set and report the number of chunks written.

- [ ] **Step 5: Switch ingestion and chat retrieval**

Update document ingestion and `answer_question()` to use the Neon-backed repository. Keep Chroma available only for a temporary local migration path if needed.

- [ ] **Step 6: Run migration and integration checks**

Run Django migrations, rebuild vectors, query a known document fact, and verify returned sources still cite the original filename.

- [ ] **Step 7: Commit**

```powershell
git add backend/apps/rag backend/apps/documents backend/config/settings.py backend/migrations
git commit -m "feat: persist RAG vectors in Neon pgvector"
```

### Task 5: Define durable document storage

**Files:**
- Modify: `backend/apps/documents/models.py`
- Modify: `backend/apps/documents/b_services.py`
- Create: `backend/apps/documents/storage.py`
- Modify: `backend/config/settings.py`
- Create: `backend/apps/documents/tests/test_storage.py`

**Interfaces:**
- Uploaded files are stored in an object-storage-compatible backend in production.
- Local development continues to use Django local media storage.
- Vector rebuilding can read the stored document or a controlled seed document.

- [ ] **Step 1: Choose storage mode**

For the initial portfolio deployment, choose one explicit path: object storage for user uploads, or a read-only seeded CV committed outside the image and loaded during deployment. Do not rely on Render local media.

- [ ] **Step 2: Write failing storage tests**

Test that local mode uses local media and production mode does not write user files to the application filesystem.

- [ ] **Step 3: Implement the storage adapter**

Select storage from `DJANGO_STORAGE_BACKEND` and environment variables. Keep file URLs private or signed if uploads contain personal information.

- [ ] **Step 4: Run tests and migrations**

Run storage tests and Django migrations in both local and production-like settings.

- [ ] **Step 5: Commit**

```powershell
git add backend/apps/documents backend/config/settings.py backend/migrations
git commit -m "feat: make document storage durable in production"
```

### Task 6: Add deployment manifests and service configuration

**Files:**
- Create: `render.yaml`
- Create: `vercel.json` only if framework defaults cannot express the project root
- Modify: `frontend/.env.example`
- Modify: `README.md`

**Interfaces:**
- Render Blueprint defines one Django web service, its build/start commands, health check, and non-secret environment-variable references.
- Vercel project is configured with `frontend/` as the root directory and `NEXT_PUBLIC_API_ORIGIN` set separately for Preview and Production.

- [ ] **Step 1: Add the Render Blueprint**

Use a Python web service with:

```yaml
buildCommand: ./build.sh
startCommand: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
healthCheckPath: /health/
```

Set `DATABASE_URL`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `LLM_PROVIDER=groq`, `GROQ_MODEL`, `GROQ_API_KEY`, and vector/storage variables through Render secrets or sync-only entries.

- [ ] **Step 2: Configure Vercel**

Set the Vercel root directory to `frontend/`, use the default Next.js build, and set `NEXT_PUBLIC_API_ORIGIN=https://<render-service>.onrender.com` for Preview and Production. Vercel environment variables apply only to new deployments, so redeploy after changing them.

- [ ] **Step 3: Document deployment commands and URLs**

Document local, Preview, and Production API origins, migration/rebuild commands, health checks, and rollback steps.

- [ ] **Step 4: Commit**

```powershell
git add render.yaml vercel.json frontend/.env.example README.md
git commit -m "chore: define Vercel and Render deployment configuration"
```

### Task 7: Deploy in staging order and verify end to end

**Files:**
- Modify: `README.md` with the final deployed URLs and operational checklist

**Interfaces:**
- Vercel frontend calls only the configured Render API origin.
- Render API connects to Neon, retrieves vectors, invokes Groq, and returns sources.

- [ ] **Step 1: Create Neon project and database**

Enable `vector`, copy the pooled connection string, run migrations, and rebuild vectors.

- [ ] **Step 2: Deploy Render API**

Set secrets, deploy the Blueprint, wait for `/health/` to pass, and inspect logs for migrations and vector initialization.

- [ ] **Step 3: Deploy Vercel frontend**

Set the production API origin, deploy, and verify no localhost/127.0.0.1 URL is present in the production browser network requests.

- [ ] **Step 4: Run the smoke checklist**

Verify:

```text
GET /health/ → 200
document upload/seed ingestion succeeds
grounded question returns an answer and source citation
unknown question triggers the grounding refusal
follow-up question preserves session context
refresh preserves intended history behavior
Groq failure returns a readable error
```

- [ ] **Step 5: Record operational limitations**

Document that Render Free may sleep after inactivity, Groq Free has request/token limits, Neon Free scales compute to zero, and production data needs backups/retention before real users depend on it.

- [ ] **Step 6: Commit final documentation**

```powershell
git add README.md
git commit -m "docs: add deployment and operations runbook"
```

## Provider recommendation summary

Use Vercel + Render + Neon + Groq for the first hosted deployment. Keep Ollama as the local provider. Do not deploy Chroma's local files or depend on a laptop Ollama server for public traffic. Revisit Render paid service, a different Python host, or a managed inference provider only after measuring traffic, latency, and cold-start impact.
