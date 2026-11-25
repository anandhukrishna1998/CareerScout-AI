import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_session, require_admin
from app.models import Job, ScrapeRun, User
from app.schemas import JobIngestRequest
from app.services.ingestion import ingest_sources
from app.services.matching import recompute_matches_for_user
from app.settings import settings

router = APIRouter()


async def _check_ai_engine() -> dict[str, str]:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{settings.ai_engine_url}/healthz")
            if resp.status_code == 200:
                return {"status": "ok", "llm_mode": "gemini + deterministic"}
    except Exception:
        pass
    return {"status": "fallback", "llm_mode": "local deterministic"}


async def _check_redis() -> dict[str, object]:
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.redis_url, socket_timeout=1.5)
        try:
            await client.ping()
            depth = await client.llen("careerscout:jobs")
            return {"status": "ok", "queue_depth": int(depth)}
        finally:
            await client.aclose()
    except Exception:
        return {"status": "unavailable", "queue_depth": 0}


@router.get("/status")
async def admin_status(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    total_jobs = await db.scalar(select(func.count(Job.id))) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 0
    recent_failures = (
        await db.scalar(
            select(func.count(ScrapeRun.id)).where(ScrapeRun.status == "failed")
        )
        or 0
    )
    runs = (
        await db.scalars(select(ScrapeRun).order_by(desc(ScrapeRun.id)).limit(20))
    ).all()
    dialect = db.bind.dialect.name if db.bind is not None else "unknown"

    sources = [
        {
            "id": "remoteok",
            "name": "RemoteOK",
            "type": "Public Feed",
            "requires_key": False,
            "configured": True,
        },
        {
            "id": "arbeitnow",
            "name": "Arbeitnow",
            "type": "Public API",
            "requires_key": False,
            "configured": True,
        },
        {
            "id": "remotive",
            "name": "Remotive",
            "type": "Public API",
            "requires_key": False,
            "configured": True,
        },
        {
            "id": "weworkremotely",
            "name": "WeWorkRemotely",
            "type": "RSS Feed",
            "requires_key": False,
            "configured": True,
        },
        {
            "id": "greenhouse",
            "name": "Greenhouse Boards",
            "type": "ATS Public API",
            "requires_key": False,
            "configured": bool(settings.greenhouse_companies.strip()),
        },
        {
            "id": "lever",
            "name": "Lever Postings",
            "type": "ATS Public API",
            "requires_key": False,
            "configured": bool(settings.lever_companies.strip()),
        },
        {
            "id": "france_travail",
            "name": "France Travail",
            "type": "OAuth2 API",
            "requires_key": True,
            "configured": bool(settings.france_travail_access_token.strip()),
        },
        {
            "id": "google_jobs",
            "name": "Google Jobs (SerpAPI)",
            "type": "Search API",
            "requires_key": True,
            "configured": bool(settings.serpapi_key.strip()),
        },
    ]

    return {
        "services": {
            "api": {"status": "ok"},
            "database": {"status": "ok", "dialect": dialect},
            "ai_engine": await _check_ai_engine(),
            "redis": await _check_redis(),
        },
        "metrics": {
            "total_jobs": total_jobs,
            "total_users": total_users,
            "recent_failures": recent_failures,
        },
        "sources": sources,
        "recent_runs": [
            {
                "id": r.id,
                "source": r.source,
                "backend": r.backend,
                "status": r.status,
                "jobs_fetched": r.jobs_fetched,
                "jobs_upserted": r.jobs_upserted,
                "duration_ms": r.duration_ms,
                "error_message": r.error_message,
                "started_at": r.started_at.isoformat(),
            }
            for r in runs
        ],
    }


@router.post("/scrape")
async def trigger_admin_scrape(
    payload: JobIngestRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    total = await ingest_sources(
        db=db,
        sources=payload.sources,
        query=payload.query,
        hours_old=payload.hours_old,
    )
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return {"total_ingested": total}
