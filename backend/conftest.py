"""Environment defaults applied before Django is configured.

pytest-django imports the settings module during collection, so anything
settings.py reads from the environment must already be in place by then -- an
autouse fixture would run far too late. python-dotenv does not override
variables that already exist, so these values also win over backend/.env,
which keeps a developer's personal secrets and database out of the test run.
"""
import os

# The compose Postgres, published on a non-default host port because 5432 is
# commonly already taken. Matches docker-compose.override.yml.
os.environ.setdefault(
    "DATABASE_URL",
    "postgres://postgres:postgres@localhost:55432/aixia_db",
)
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "insecure-key-used-only-by-pytest",
)

# Forced, not defaulted. settings.py enables SECURE_SSL_REDIRECT whenever DEBUG
# is off, and that block runs at import time -- before Django's test runner
# gets its chance to set DEBUG = False. If a developer's .env happens to say
# DJANGO_DEBUG=False, every test client POST would be answered with a 301
# instead of reaching the view. The production security settings are verified
# against a real container instead (see the deployment notes), not here.
os.environ["DJANGO_DEBUG"] = "True"
