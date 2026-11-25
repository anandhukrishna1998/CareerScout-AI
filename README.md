# CareerScout AI Monorepo

Production-oriented AI-powered job intelligence SaaS platform.

## Tech Stack

- **Frontend:** Next.js 15, React, TypeScript, TailwindCSS, Zustand, TanStack Query
- **Backend:** FastAPI, Pydantic v2, SQLAlchemy 2.0, asyncpg, Fernet CV encryption at rest
- **AI Engine:** Provider-agnostic LLM abstraction (Gemini REST + deterministic ATS fallback)
- **Jobs/Scheduling:** Redis queue workers + APScheduler daily pipeline
- **Data:** PostgreSQL + pgvector
- **Infra:** Docker Compose + Nginx reverse proxy
- **Package Managers:** `pnpm` (Node) + `uv` (Python `>=3.12`)

## Quick Start on a Fresh Clone

### Option 1: Docker Compose (Recommended Full Stack)

1. Install Docker Desktop, `pnpm`, and `uv` (only Docker is needed to run containers).
2. Create your environment file:

```bash
cp .env.example .env
```

3. Start all services:

```bash
docker compose up --build
```

4. Open:
   - App (via Nginx): http://localhost
   - Web directly: http://localhost:3000
   - API Swagger docs: http://localhost:8000/docs

### Option 2: Local Setup & Test Suite (Without Docker)

1. Bootstrap JS and Python workspace dependencies:

```bash
make setup
```

2. Run all automated checks and tests:

```bash
make test
make typecheck
make lint
```

3. Run the web frontend + API locally:

```bash
# Terminal 1: API
.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --port 8000

# Terminal 2: AI Engine
.venv/bin/uvicorn app.main:app --app-dir apps/ai-engine --reload --port 8010

# Terminal 3: Web
pnpm dev:web
```

## Monorepo Layout

```txt
apps/
  web/         Next.js 15 frontend
  api/         FastAPI core API (auth, CVs, jobs, matches, insights, analytics, email, admin)
  ai-engine/   ATS 60/25/15 scoring, CV parsing, Gemini LLM + embeddings
  worker/      Multi-source job scraper & Redis queue consumer
  scheduler/   APScheduler daily pipeline dispatcher
packages/
  ui/ types/ config/ utils/
infrastructure/
  nginx/       Reverse proxy + API rate limiting
```
