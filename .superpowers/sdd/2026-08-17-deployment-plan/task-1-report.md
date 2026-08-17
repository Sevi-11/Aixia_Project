# Task 1 report: deployment configuration contract

## Files changed

- `backend/requirements.txt` (created): pinned runtime and planned deployment dependencies.
- `backend/.env.example` (created): documented the required deployment and local provider variables without secret values.
- `backend/config/settings.py`: reads the Django secret, debug flag, host and CORS lists from the environment; prefers `DATABASE_URL` and retains the existing split PostgreSQL variables as a local fallback.
- `README.md`: added the local/Render/Vercel configuration contract.
- `.superpowers/sdd/2026-08-17-deployment-plan/task-1-report.md` (created): this report; intentionally not staged because the plan's commit step names only the four implementation files above.

## Validation

```text
python backend/manage.py check
System check identified no issues (0 silenced).
Exit code: 0

python -m pip check
No broken requirements found.
Exit code: 0
```

Focused configuration import with a sample PostgreSQL URL, `DJANGO_DEBUG=False`, and comma-separated host/CORS values:

```text
{'debug': False, 'database_name': 'aixia', 'database_host': 'neon.example.com', 'database_port': '5432', 'database_options': {'sslmode': 'require'}, 'allowed_hosts': ['api.example.com', 'api-preview.example.com'], 'cors_origins': ['https://app.example.com', 'https://preview.example.com']}
Exit code: 0
```

No focused automated test was added: the repository has no Django settings test structure, and Task 1 is configuration-only. The Django system check and explicit settings import cover the configuration contract without adding speculative test infrastructure.

## Concerns

- `gunicorn`, `whitenoise`, `langchain-groq`, and `pgvector` are declared for later deployment tasks but are not installed in the current local Python environment. `pip check` validates installed-package dependency consistency; it does not install or validate the new requirements file.
- The checks do not connect to PostgreSQL, Neon, Render, Vercel, Ollama, or Groq; those require later deployment tasks and environment credentials.
- Pre-existing local host/CORS additions were retained as unstaged working-tree changes and were excluded from the Task 1 commit.

## Fix round 1: production secret requirement

`backend/config/settings.py` no longer provides a deterministic secret when production settings are active. `DJANGO_SECRET_KEY` is now required whenever `DJANGO_DEBUG=False` (including when it is unset); a missing value raises `RuntimeError` during startup. The only fallback is the clearly named local-development value, available when `DJANGO_DEBUG=True` is explicitly set. The README now documents that local opt-in.

Added `backend/config/tests.py` with a subprocess-based regression test that runs the real Django settings import. Before the fix, it failed because `manage.py check` returned exit code 0 with `DJANGO_DEBUG=False` and no secret. After the fix:

```text
python -m unittest backend.config.tests.SecretKeySettingsTests.test_missing_production_secret_prevents_startup -v
Ran 1 test in 0.692s
OK

$env:DJANGO_DEBUG = 'True'; python backend/manage.py check
System check identified no issues (0 silenced).

python -m pip check
No broken requirements found.
```

The regular local check now requires `DJANGO_DEBUG=True` when no local `DJANGO_SECRET_KEY` is configured; this is intentional and documented.

## Fix round 2: generated debug-only fallback

The debug-only fallback no longer embeds a deterministic secret in source control. When `DJANGO_DEBUG=True` and `DJANGO_SECRET_KEY` is unset, Django now uses a fresh `secrets.token_urlsafe(50)` value for that process. When `DJANGO_DEBUG=False`, a missing `DJANGO_SECRET_KEY` still raises `RuntimeError` before startup.

The focused regression test now validates both modes, including two clean debug settings imports that must produce distinct local keys:

```text
python -m unittest backend.config.tests.SecretKeySettingsTests -v
test_debug_without_secret_uses_a_generated_local_key (backend.config.tests.SecretKeySettingsTests.test_debug_without_secret_uses_a_generated_local_key) ... ok
test_missing_production_secret_prevents_startup (backend.config.tests.SecretKeySettingsTests.test_missing_production_secret_prevents_startup) ... ok

----------------------------------------------------------------------
Ran 2 tests in 0.888s

OK
Exit code: 0
```

Backend validation:

```text
Remove-Item Env:DJANGO_SECRET_KEY -ErrorAction SilentlyContinue
$env:DJANGO_DEBUG = 'True'
python backend/manage.py check
System check identified no issues (0 silenced).
Exit code: 0

python -m pip check
No broken requirements found.
Exit code: 0
```
