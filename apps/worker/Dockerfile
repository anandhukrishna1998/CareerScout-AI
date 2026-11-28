FROM python:3.12-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5.21 /uv /usr/local/bin/uv

RUN groupadd --system app && useradd --system --gid app --home /app app

COPY apps/worker/pyproject.toml ./
RUN uv sync --no-dev

COPY apps/worker .
RUN chown -R app:app /app

USER app
CMD [".venv/bin/python", "-m", "app.main"]
