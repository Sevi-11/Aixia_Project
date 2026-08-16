# AGENTS.md

## Project overview

Aixia is a locally run, full-stack RAG chatbot. The repository contains a Django/DRF backend, a Next.js frontend, and standalone/test tooling.

## Repository layout

- `backend/` — Django project, API apps, and standalone `rag/` pipeline.
- `frontend/` — Next.js application.
- `tests/` — project-level tests and evaluation tooling.
- `README.md` — architecture, setup, and API documentation.

## Development guidelines

- Read the relevant README and neighboring code before making changes.
- Keep the `backend/apps/rag/` package independent of Django where practical.
- Preserve the grounding behavior: answers should use retrieved document context and explicitly decline when the context is insufficient.
- Keep secrets, uploaded files, vector-store data, build output, and dependency directories out of commits.
- Prefer small, focused changes; update tests and documentation when behavior or setup changes.

## Validation

Run the narrowest relevant checks first, then the broader suite when practical:

- Backend: run the repository's configured Python/pytest checks from the backend or project root.
- Frontend: run the scripts defined in `frontend/package.json` (lint, type-check, and build as relevant).
- End-to-end or integration checks may require PostgreSQL and Ollama to be running locally.

Before reporting completion, state which checks were run and whether any environment-dependent checks were skipped.
