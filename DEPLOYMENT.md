# Deployment Guide

## Free-tier MVP

- Web: Vercel
- Database: Supabase PostgreSQL (+ pgvector enabled)
- Queue/Workers/API/AI Engine: Railway (or Render)
- Redis: Upstash or Railway Redis

## Production (VPS / Hetzner / DO)

1. Provision VM and install Docker + Compose.
2. Clone repo, create `.env` from `.env.example`.
3. Start:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

4. Add TLS:
- Put TLS certificates on host
- Update nginx server block for `listen 443 ssl;`

## Scaling Strategy

- Scale `scraper-worker` horizontally first.
- Separate queues per provider/category once volume grows.
- Add Postgres read replica for analytics/search-heavy workloads.
- Add caching layer for job explorer and dashboard endpoints.

## Ops Best Practices

- Centralized logs with correlation IDs
- Queue lag and retry rate alerts
- Daily DB backup + restore drills
- Canary deploy for API/AI engine
