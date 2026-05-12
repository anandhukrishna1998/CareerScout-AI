# CareerScout AI Architecture

## System Architecture Diagram

```txt
                +------------------------+
                |      Next.js Web       |
                |  Dashboard / Explorer  |
                +-----------+------------+
                            |
                         (Nginx)
                            |
         +------------------+------------------+
         |                                     |
+--------v---------+                 +---------v---------+
|      FastAPI     |  <----------->  |     AI Engine     |
| Auth / Jobs API  |      HTTP       | LLM + ATS + Embeds|
+--------+---------+                 +---------+---------+
         |                                     |
         |                                     |
+--------v---------+                 +---------v---------+
|    PostgreSQL    |                 |       Redis       |
|  + pgvector      |                 | Queue + cache      |
+------------------+                 +---------+---------+
                                                |
                                     +----------v----------+
                                     |  Worker + Scheduler |
                                     | Scrape / Match / Mail|
                                     +----------------------+
```

## Job Provider Plugin Model

Each provider implements:

- `search_recent_jobs()`
- `normalize()`
- `fetch_job_detail()` (optional for deep enrichment)

Initial focus: France + AI/Data/ML/Software roles.

## Queue Flow

1. `scrape.provider.*`
2. `normalize.jobs`
3. `embed.jobs`
4. `match.user_jobs`
5. `email.daily_digest`
6. `cleanup.expired_jobs`

## Security Baseline

- JWT access + refresh rotation
- Signed private CV storage URLs
- MIME/file-size validation
- API rate limiting (nginx + app-level)
- SQLAlchemy parameterized queries
- CORS controls and secure headers
- GDPR-friendly data lifecycle

## Deployment Targets

- MVP: Vercel + Supabase + Railway
- Growth: Render/Railway + managed Postgres
- Scale: VPS/Hetzner + managed DB/Redis + horizontal workers
