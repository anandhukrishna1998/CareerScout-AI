FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

COPY apps/scheduler/pyproject.toml ./
RUN uv sync --no-dev

COPY apps/scheduler .

CMD [".venv/bin/python", "-m", "app.main"]
