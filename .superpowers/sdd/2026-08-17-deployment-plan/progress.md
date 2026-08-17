# SDD ledger — plan: docs/superpowers/plans/2026-08-17-deployment-plan.md

## Preflight

Ruling: execute in the current dirty workspace — existing application changes are user-owned and no safe isolated worktree is available without transplanting the entire uncommitted state; no reset, checkout, or discard will be used.

| Task | Shared files/interfaces | Preflight result |
|---|---|---|
| 1 ↔ 2 | `backend/config/settings.py`; Task 1 defines environment contract, Task 2 consumes it | Compatible; Task 2 must retain Task 1 variable names. |
| 1 ↔ 3 | `backend/requirements.txt`; Task 1 owns dependency inventory, Task 3 adds Groq dependency | Compatible; Task 3 updates the same dependency file. |
| 1 ↔ 4 | `backend/config/settings.py`; both use `DATABASE_URL` | Compatible; pooled Neon URL remains the single production database input. |
| 3 ↔ 4 | `backend/apps/rag/f_chains.py`; provider factory and vector retrieval must remain independent | Compatible; `answer_question()` return contract is unchanged. |
| 4 ↔ 5 | document ingestion and storage; vector rebuild consumes durable documents | Dependency is explicit; Task 5 must provide the production document source before Task 4 is enabled in production. |
| 5 ↔ 6 | settings/environment; storage values flow into Render configuration | Compatible. |
| 6 ↔ 7 | Render/Vercel manifests and health check | Compatible; Task 7 is deployment verification only. |

| Task | Internal consistency |
|---|---|
| 1 | Consistent: settings, dependency list, env template, and docs form one contract. |
| 2 | Consistent: health endpoint, static serving, build script, and Render start command align. |
| 3 | Consistent: factory selection is testable without external calls and preserves chain output. |
| 4 | Consistent: pgvector repository, rebuild command, and retrieval integration share metadata contract. |
| 5 | Consistent: storage adapter separates local and production file persistence. |
| 6 | Consistent: Blueprint and Vercel variables consume earlier configuration. |
| 7 | Consistent: verification checks every deployed dependency. |
