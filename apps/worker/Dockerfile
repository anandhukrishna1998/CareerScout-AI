FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

COPY apps/worker/pyproject.toml ./
RUN uv sync --no-dev

COPY apps/worker .

CMD [".venv/bin/python", "-m", "app.main"]
