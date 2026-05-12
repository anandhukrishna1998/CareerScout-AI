# CareerScout AI Monorepo

Production-oriented AI-powered job intelligence SaaS scaffold.

## Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, TailwindCSS
- Backend: FastAPI, Pydantic v2, SQLAlchemy 2.0, asyncpg
- AI Engine: Provider-agnostic LLM abstraction (Gemini enabled)
- Jobs/Scheduling: Redis + queue workers + scheduler service
- Data: PostgreSQL + pgvector
- Infra: Docker Compose + Nginx reverse proxy
- Python package/environment manager: uv

## Monorepo Layout

```txt
apps/
  web/
  api/
  worker/
  scheduler/
  ai-engine/
packages/
  ui/
  types/
  config/
  utils/
infrastructure/
  docker/
  nginx/
```

## Quick Start (Docker)

1. Copy env:

```bash
cp .env.example .env
```

2. Start all services:

```bash
docker compose up --build
```

3. Access:

- Web: http://localhost:3000
- API: http://localhost:8000/docs (via nginx routing also available)
- Nginx gateway: http://localhost:80

## Python Services and uv

Each Python app (`api`, `worker`, `scheduler`, `ai-engine`) includes:

- `pyproject.toml`
- `uv.lock` (to be generated in your environment)
- Dockerfile using `uv sync --frozen`

Generate/update lockfiles locally when dependencies change:

```bash
cd apps/api && uv lock
cd ../worker && uv lock
cd ../scheduler && uv lock
cd ../ai-engine && uv lock
```

## MVP Scope Included

- Auth-ready API skeleton with JWT utility
- CV upload metadata endpoint scaffold
- Multi-source scraping orchestrator with backend fallbacks (JobSpy/Scrapy/Playwright/httpx)
- ATS hybrid scoring scaffold
- Provider-agnostic AI engine with Gemini provider starter
- Daily digest scheduling/dispatch stubs
- Secure-by-default infrastructure patterns

## Scraping Coverage

Configured source catalog includes:

- LinkedIn Jobs
- Google Jobs
- Welcome to the Jungle
- HelloWork
- Indeed
- APEC
- France Travail
- Monster
- Free-Work
- Malt
- RemoteOK
- WeWorkRemotely
- Greenhouse
- Lever
- company career pages

Notes:

- `remoteok` and `weworkremotely` have live `httpx` adapters implemented.
- `greenhouse` and `lever` have live `httpx` adapters through public board APIs (requires company slugs).
- `google_jobs` supports live retrieval through SerpAPI when `SERPAPI_KEY` is configured.
- `france_travail` and `apec` support live API adapters when credentials/endpoints are configured.
- `welcome_to_the_jungle`, `hellowork`, `free_work`, and `malt` support feed-driven adapters using configurable RSS/feed URLs.
- `company_career_pages` supports live link discovery from configured career page URLs.
- `linkedin_jobs`, `indeed`, and `monster` can run through `JobSpy` backend.
- `scrapy` and `playwright` backends are wired as fallback hooks and ready for site-specific spiders/flows.
- Backend order per source is configurable through `.env`.

## Next Steps

- Implement persistent auth + refresh-token storage
- Add Alembic migrations for full schema
- Implement real provider adapters and anti-bot strategy
- Integrate Resend/SendGrid templates
- Add production CI pipeline and tests