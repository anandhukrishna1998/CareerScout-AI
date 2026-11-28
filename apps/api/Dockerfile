FROM python:3.12-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5.21 /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home /app app

COPY apps/api/pyproject.toml ./
RUN uv sync --no-dev

COPY apps/api .
RUN mkdir -p /app/storage/cvs && chown -R app:app /app

USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD ["curl", "-fsS", "http://127.0.0.1:8000/healthz"]
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
