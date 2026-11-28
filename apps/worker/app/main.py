import argparse
import asyncio
import html
import json
import logging
import os
import re
from datetime import date, datetime, timezone

import asyncpg
import httpx
import redis.asyncio as aioredis

from app.geo import is_europe_job, parse_europe_country_city, sanitize_http_url
from app.scrape_orchestrator import scrape_all_sources

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")

QUEUE_NAME = "careerscout:jobs"


def _to_asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _parse_posted_at(raw: object) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, date):
        return datetime(raw.year, raw.month, raw.day, tzinfo=timezone.utc)
    text = str(raw or "").strip()
    if text:
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(tz=timezone.utc)


def _infer_remote_mode(location: str, title: str, description: str) -> str:
    blob = f"{location} {title} {description[:250]}".lower()
    if "hybrid" in blob:
        return "hybrid"
    if "remote" in blob or "worldwide" in blob or "anywhere" in blob:
        return "remote"
    return "onsite"


def _parse_country_city(location: str) -> tuple[str, str]:
    return parse_europe_country_city(location)


def _extract_skills_simple(text: str) -> list[str]:
    candidates = [
        "Python",
        "TypeScript",
        "JavaScript",
        "SQL",
        "NoSQL",
        "PostgreSQL",
        "Redis",
        "FastAPI",
        "Docker",
        "Kubernetes",
        "AWS",
        "LLM",
        "RAG",
        "PyTorch",
    ]
    lower = text.lower()
    return [
        sk
        for sk in candidates
        if re.search(rf"(?<![A-Za-z0-9]){re.escape(sk.lower())}(?![A-Za-z0-9])", lower)
    ]


async def _score_via_ai_engine(
    ai_engine_url: str, cv_profile: dict[str, object], jobs: list[dict[str, object]]
) -> list[dict[str, object]]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{ai_engine_url}/ats/score-batch",
                json={"cv_profile": cv_profile, "jobs": jobs},
            )
            resp.raise_for_status()
            results = resp.json().get("results")
            if isinstance(results, list) and len(results) == len(jobs):
                return results
    except Exception:
        pass

    cv_skills = {str(s).lower(): str(s) for s in (cv_profile.get("skills") or [])}  # type: ignore[union-attr]
    fallback: list[dict[str, object]] = []
    for job in jobs:
        job_skills = _extract_skills_simple(f"{job['title']}\n{job['description']}")
        job_map = {s.lower(): s for s in job_skills}
        matched = [job_map[k] for k in sorted(set(cv_skills) & set(job_map))]
        missing = [job_map[k] for k in sorted(set(job_map) - set(cv_skills))]
        skill_score = int(round(len(matched) / max(len(job_map), 1) * 60)) if job_map else 30
        score = min(100, skill_score + 18 + 10)
        fallback.append(
            {
                "score": score,
                "skill_score": skill_score,
                "semantic_score": 18,
                "experience_score": 10,
                "matched_skills": matched,
                "strengths": [f"Match on {s}" for s in matched[:4]],
                "missing_skills": missing[:8],
                "action_items": ["Quantify measurable delivery impact in your CV summary."],
                "recommendation": "Good match" if score >= 70 else "Moderate match",
            }
        )
    return fallback


async def persist_scrape_results(database_url: str, sources: list[str] | None = None) -> int:
    conn = await asyncpg.connect(_to_asyncpg_dsn(database_url))
    total = 0
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
              id SERIAL PRIMARY KEY,
              source VARCHAR(64) NOT NULL,
              external_id VARCHAR(255) NOT NULL,
              title VARCHAR(255) NOT NULL,
              company VARCHAR(255) NOT NULL,
              location VARCHAR(255) NOT NULL,
              country VARCHAR(128) NOT NULL DEFAULT 'Worldwide',
              city VARCHAR(128) NOT NULL DEFAULT '',
              remote_mode VARCHAR(32) NOT NULL DEFAULT 'remote',
              contract_type VARCHAR(64) NOT NULL DEFAULT 'Full-time',
              experience_level VARCHAR(32) NOT NULL DEFAULT 'mid',
              salary_text VARCHAR(128) NOT NULL DEFAULT '',
              skills JSONB NOT NULL DEFAULT '[]'::jsonb,
              description TEXT NOT NULL,
              apply_url VARCHAR(1024) NOT NULL DEFAULT '',
              posted_at TIMESTAMPTZ NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_source_external_id
            ON jobs(source, external_id)
            """
        )
        europe_only = os.getenv("EUROPE_ONLY_JOBS", "true").strip().lower() not in {"0", "false", "no"}
        scrape_results = await scrape_all_sources(sources=sources)
        for source, jobs in scrape_results.items():
            filtered_jobs = (
                [
                    job
                    for job in jobs
                    if is_europe_job(
                        job.location,
                        title=job.title,
                        description=job.description,
                        source=job.source,
                    )
                ]
                if europe_only
                else jobs
            )
            logger.info(
                "source=%s scraped_jobs=%s accepted_eu_jobs=%s",
                source,
                len(jobs),
                len(filtered_jobs),
            )
            for job in filtered_jobs:
                country, city = _parse_country_city(job.location)
                remote_mode = _infer_remote_mode(job.location, job.title, job.description)
                skills = _extract_skills_simple(f"{job.title}\n{job.description}")
                posted_dt = _parse_posted_at(job.posted_at)
                await conn.execute(
                    """
                    INSERT INTO jobs (
                      source, external_id, title, company, location, country, city,
                      remote_mode, contract_type, experience_level, salary_text,
                      skills, description, apply_url, posted_at, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Full-time', 'mid', '', $9::jsonb, $10, $11, $12, NOW())
                    ON CONFLICT (source, external_id)
                    DO UPDATE SET
                      title = EXCLUDED.title,
                      company = EXCLUDED.company,
                      location = EXCLUDED.location,
                      country = EXCLUDED.country,
                      city = EXCLUDED.city,
                      remote_mode = EXCLUDED.remote_mode,
                      skills = EXCLUDED.skills,
                      description = EXCLUDED.description,
                      apply_url = EXCLUDED.apply_url,
                      posted_at = EXCLUDED.posted_at
                    """,
                    job.source[:64],
                    job.external_id[:255],
                    job.title[:255],
                    job.company[:255],
                    job.location[:255],
                    country[:128],
                    city[:128],
                    remote_mode[:32],
                    json.dumps(skills),
                    job.description,
                    sanitize_http_url(job.apply_url)[:1024],
                    posted_dt,
                )
                total += 1
    finally:
        await conn.close()
    return total


async def recompute_all_user_matches(database_url: str, ai_engine_url: str) -> int:
    conn = await asyncpg.connect(_to_asyncpg_dsn(database_url))
    updated = 0
    try:
        users = await conn.fetch(
            """
            SELECT u.id, cp.summary, cp.skills, cp.languages, cp.years_experience
            FROM users u
            JOIN cvs c ON c.user_id = u.id AND c.is_primary = TRUE
            JOIN cv_parsed cp ON cp.cv_id = c.id
            """
        )
        jobs = await conn.fetch(
            "SELECT id, title, description, location FROM jobs ORDER BY posted_at DESC LIMIT 100"
        )
        if not users or not jobs:
            return 0
        payload_jobs = [
            {"title": j["title"], "description": j["description"], "location": j["location"]}
            for j in jobs
        ]
        for u in users:
            skills = json.loads(u["skills"]) if isinstance(u["skills"], str) else list(u["skills"] or [])
            langs = (
                json.loads(u["languages"])
                if isinstance(u["languages"], str)
                else list(u["languages"] or [])
            )
            cv_profile = {
                "summary": u["summary"] or "",
                "skills": skills,
                "languages": langs,
                "years_experience": int(u["years_experience"] or 0),
            }
            scores = await _score_via_ai_engine(ai_engine_url, cv_profile, payload_jobs)
            for j, sc in zip(jobs, scores):
                await conn.execute(
                    """
                    INSERT INTO job_matches (
                      user_id, job_id, score, skill_score, semantic_score, experience_score,
                      matched_skills, strengths, missing_skills, action_items, explanation, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, NOW())
                    ON CONFLICT (user_id, job_id)
                    DO UPDATE SET
                      score = EXCLUDED.score,
                      skill_score = EXCLUDED.skill_score,
                      semantic_score = EXCLUDED.semantic_score,
                      experience_score = EXCLUDED.experience_score,
                      matched_skills = EXCLUDED.matched_skills,
                      strengths = EXCLUDED.strengths,
                      missing_skills = EXCLUDED.missing_skills,
                      action_items = EXCLUDED.action_items,
                      explanation = EXCLUDED.explanation,
                      updated_at = NOW()
                    """,
                    u["id"],
                    j["id"],
                    int(sc.get("score", 0)),
                    int(sc.get("skill_score", 0)),
                    int(sc.get("semantic_score", 0)),
                    int(sc.get("experience_score", 0)),
                    json.dumps(sc.get("matched_skills", [])),
                    json.dumps(sc.get("strengths", [])),
                    json.dumps(sc.get("missing_skills", [])),
                    json.dumps(sc.get("action_items", [])),
                    str(sc.get("recommendation", "")),
                )
                updated += 1
    finally:
        await conn.close()
    return updated


def _render_simple_digest(recipient_name: str, subject: str, rows: list[dict[str, object]]) -> str:
    cards = "".join(
        f"<div style='border:1px solid #E2DFD6;border-radius:16px;padding:16px;margin-bottom:10px;background:#FCFBF8;'>"
        f"<strong style='color:#1B201C;'>{html.escape(str(r['title']))}</strong> — "
        f"<span style='color:#2D6A4F;'>{int(r['score'])}/100</span>"
        f"<p style='color:#3F4741;margin:4px 0;'>{html.escape(str(r['company']))} · {html.escape(str(r['location']))}</p>"
        f"</div>"
        for r in rows
    )
    return (
        f"<div style='font-family:Plus Jakarta Sans,sans-serif;background:#F3F1EC;padding:24px;'>"
        f"<h1 style='color:#1B201C;'>{html.escape(subject)}</h1>"
        f"<p style='color:#3F4741;'>Hi {html.escape(recipient_name)},</p>{cards}</div>"
    )


async def dispatch_daily_digests(database_url: str) -> int:
    conn = await asyncpg.connect(_to_asyncpg_dsn(database_url))
    sent_count = 0
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    email_from = os.getenv("EMAIL_FROM", "no-reply@careerscout.ai").strip()
    try:
        configs = await conn.fetch(
            """
            SELECT es.user_id, es.recipient_email, es.subject_template, es.min_match_score,
                   es.max_jobs_per_email, u.full_name, u.email
            FROM email_settings es
            JOIN users u ON u.id = es.user_id
            WHERE es.digest_enabled = TRUE
            """
        )
        for cfg in configs:
            matches = await conn.fetch(
                """
                SELECT j.title, j.company, j.location, jm.score
                FROM job_matches jm
                JOIN jobs j ON j.id = jm.job_id
                WHERE jm.user_id = $1 AND jm.score >= $2
                ORDER BY jm.score DESC
                LIMIT $3
                """,
                cfg["user_id"],
                int(cfg["min_match_score"]),
                int(cfg["max_jobs_per_email"]),
            )
            if not matches:
                continue
            recipient = cfg["recipient_email"] or cfg["email"]
            subject = cfg["subject_template"]
            html_body = _render_simple_digest(
                cfg["full_name"] or recipient, subject, [dict(m) for m in matches]
            )
            status_str = "simulated"
            provider = "local_preview"
            err_msg = ""
            if resend_key and resend_key.lower() not in {"replace-me", "changeme"}:
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        resp = await client.post(
                            "https://api.resend.com/emails",
                            headers={"Authorization": f"Bearer {resend_key}"},
                            json={
                                "from": email_from,
                                "to": [recipient],
                                "subject": subject,
                                "html": html_body,
                            },
                        )
                        resp.raise_for_status()
                    status_str = "sent"
                    provider = "resend"
                except Exception as exc:
                    status_str = "failed"
                    provider = "resend"
                    err_msg = str(exc)[:300]

            now = datetime.now(tz=timezone.utc)
            await conn.execute(
                "UPDATE email_settings SET last_sent_at = $1 WHERE user_id = $2",
                now,
                cfg["user_id"],
            )
            await conn.execute(
                """
                INSERT INTO email_logs (user_id, recipient_email, subject, job_count, status, provider, error_message, sent_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                cfg["user_id"],
                recipient,
                subject,
                len(matches),
                status_str,
                provider,
                err_msg,
                now,
            )
            sent_count += 1
    finally:
        await conn.close()
    return sent_count


async def process_task(task: dict[str, object], database_url: str, ai_engine_url: str) -> int:
    task_type = str(task.get("type", ""))
    if task_type == "scrape.run":
        sources = task.get("sources")
        return await persist_scrape_results(
            database_url, sources=sources if isinstance(sources, list) else None
        )
    if task_type == "match.recompute":
        return await recompute_all_user_matches(database_url, ai_engine_url)
    if task_type == "email.daily_digest":
        return await dispatch_daily_digests(database_url)
    logger.warning("unknown task type=%s", task_type)
    return 0


async def run_queue_loop() -> None:
    database_url = os.getenv(
        "DATABASE_URL", "postgresql+asyncpg://careerscout:careerscout@postgres:5432/careerscout"
    )
    ai_engine_url = os.getenv("AI_ENGINE_URL", "http://ai-engine:8010")
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    client = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=20)
    logger.info("worker listening on queue=%s", QUEUE_NAME)
    try:
        while True:
            try:
                item = await client.blpop(QUEUE_NAME, timeout=10)
                if item is None:
                    continue
                _, raw_payload = item
                task = json.loads(raw_payload)
                if not isinstance(task, dict):
                    logger.warning("ignoring non-dict worker payload")
                    continue
                count = await process_task(task, database_url, ai_engine_url)
                logger.info("processed task=%s count=%s", task.get("type"), count)
            except asyncio.CancelledError:
                raise
            except TimeoutError:
                continue
            except Exception as exc:
                logger.warning("worker loop error=%s", exc)
                await asyncio.sleep(3)
    finally:
        await client.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="CareerScout Scraper Worker")
    parser.add_argument("--once", action="store_true", help="Run one scrape pass and exit")
    args = parser.parse_args()
    database_url = os.getenv(
        "DATABASE_URL", "postgresql+asyncpg://careerscout:careerscout@postgres:5432/careerscout"
    )
    if args.once:
        asyncio.run(persist_scrape_results(database_url))
    else:
        asyncio.run(run_queue_loop())


if __name__ == "__main__":
    main()
