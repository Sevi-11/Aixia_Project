#!/bin/sh
# Container entrypoint.
#
# This exists as a file rather than an inline dockerCommand because Render
# already runs dockerCommand through a shell, so an inline sh -c "a && b" is
# treated as a single command name and exits 127. One executable path has no
# quoting or operator for anything to mis-parse.
set -e

# Render offers no pre-deploy hook on the free tier, so migrations run here.
# Failing loudly is deliberate: a half-migrated database serving traffic is
# worse than a deploy that stops.
python manage.py migrate --noinput

# Bind to $PORT when the platform sets one; 8000 keeps local Docker working.
# exec so gunicorn becomes PID 1 and receives SIGTERM directly -- without it,
# shutdowns are a 30-second timeout instead of a graceful drain.
#
# --access-logfile - sends a line per request to stdout. Gunicorn writes no
# access log at all by default, which makes a deployed service far quieter
# than runserver and leaves you unable to tell a request that failed from one
# that never arrived.
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers 1 \
  --threads 4 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
