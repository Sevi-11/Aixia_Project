# Aixia Deployment Design

## Decision

Deploy the Next.js frontend to Vercel and the Django API to Render. Use Neon Postgres for relational data and migrate the local Chroma vector store to Postgres `pgvector`. Use Groq for the hosted LLM and retain Ollama as the local-development provider.

## Rationale

Vercel is the lowest-friction deployment target for the existing Next.js app. Render supports Django web services and gives the API a public HTTPS endpoint, but its free web services spin down after inactivity and their filesystem is ephemeral. Render's free Postgres expires after 30 days, so it is unsuitable for durable project data without upgrading.

Neon keeps the database independent from the application host, supports connection pooling, and supports `pgvector`. Moving embeddings into the same durable Postgres service avoids depending on Chroma files that would disappear on Render redeploys or restarts.

Groq is appropriate for the hosted prototype because a laptop-hosted Ollama instance is not a reliable public production dependency. The provider must be abstracted behind an environment-selected LLM factory so local Ollama and hosted Groq use the same chat endpoint and grounding prompt.

## Non-goals

- No public exposure of a laptop Ollama server.
- No production reliance on Render's free Postgres or ephemeral filesystem.
- No user authentication redesign in this deployment phase; session ownership remains a separate security milestone.
- No unnecessary Kubernetes, Docker orchestration, or microservice split.

## Deployment invariants

- Secrets are environment variables only; no credentials are committed.
- Production Django runs with `DEBUG=False`, a generated `SECRET_KEY`, explicit hosts, HTTPS-aware settings, and secure CORS origins.
- The API binds to Render's `PORT` and exposes a lightweight health endpoint.
- Database migrations run before the web service accepts traffic.
- Uploaded documents and embeddings are durable outside the Render service filesystem.
- Groq rate-limit and provider errors are returned as clear, retryable API errors.
- Local development continues to support PostgreSQL and Ollama without requiring cloud credentials.
