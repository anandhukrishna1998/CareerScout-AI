FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

COPY apps/ai-engine/pyproject.toml apps/ai-engine/uv.lock ./
RUN uv sync --frozen --no-dev

COPY apps/ai-engine .

EXPOSE 8010
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
