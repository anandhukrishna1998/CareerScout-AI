import asyncio
import logging
import os

import asyncpg
from app.scrape_orchestrator import scrape_all_sources
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")


def _to_asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def parse_posted_at(date_str: str) -> datetime:
    try:
        if len(date_str) == 10:
            return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        logger.warning(f"Failed to parse date: {date_str}")
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


async def run_worker() -> None:
    database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://careerscout:careerscout@postgres:5432/careerscout")
    conn = await asyncpg.connect(_to_asyncpg_dsn(database_url))
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
          id SERIAL PRIMARY KEY,
          source VARCHAR(64) NOT NULL,
          external_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          company VARCHAR(255) NOT NULL,
          location VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          apply_url VARCHAR(1024) NOT NULL DEFAULT '',
          posted_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    await conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_source_external_id
        ON jobs(source, external_id)
        """
    )
    scrape_results = await scrape_all_sources()
    for source, jobs in scrape_results.items():
        logger.info("source=%s scraped_jobs=%s", source, len(jobs))
        for job in jobs:
            await conn.execute(
                """
                INSERT INTO jobs (source, external_id, title, company, location, description, apply_url, posted_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
                ON CONFLICT (source, external_id)
                DO UPDATE SET
                  title = EXCLUDED.title,
                  company = EXCLUDED.company,
                  location = EXCLUDED.location,
                  description = EXCLUDED.description,
                  apply_url = EXCLUDED.apply_url,
                  posted_at = EXCLUDED.posted_at
                """,
                job.source,
                job.external_id,
                job.title,
                job.company,
                job.location,
                job.description,
                job.apply_url,
                parse_posted_at(job.posted_at),
            )
    await conn.close()


if __name__ == "__main__":
    asyncio.run(run_worker())
