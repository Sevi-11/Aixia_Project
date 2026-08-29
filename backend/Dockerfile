FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu --prefix=/install -r requirements.txt

COPY . .

ENV PYTHONPATH=/install/lib/python3.12/site-packages
ENV DJANGO_DEBUG=True
ENV DJANGO_SECRET_KEY=build-time-key-not-used-in-runtime
RUN python manage.py collectstatic --noinput

FROM python:3.12-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY --from=builder /app /app

RUN mkdir -p /app/media /app/data/chroma_db /app/staticfiles \
    && groupadd --system django \
    && useradd --system --gid django --home-dir /app --no-create-home django \
    && chown -R django:django /app

ENV HOME=/app
USER django

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/admin/login/')" || exit 1

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
