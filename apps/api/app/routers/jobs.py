from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_session
from app.models import Job

router = APIRouter()


@router.get("")
async def list_jobs(
    country: str | None = None,
    city: str | None = None,
    technologies: str | None = Query(default=None),
    remote_mode: str | None = None,
    posting_age_hours: int = 24,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=posting_age_hours)
    query = select(Job).where(Job.posted_at >= cutoff).order_by(Job.posted_at.desc()).limit(50)
    rows = (await db.scalars(query)).all()

    return {
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "company": row.company,
                "country": country or "France",
                "city": city or row.location,
                "remote_mode": remote_mode or "remote/hybrid",
                "source": row.source,
                "apply_url": row.apply_url,
                "posted_at": row.posted_at.isoformat(),
            }
            for row in rows
        ],
        "filters": {
            "country": country,
            "city": city,
            "technologies": technologies,
            "posting_age_hours": posting_age_hours,
        },
    }


@router.get("/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db_session)) -> dict[str, object]:
    try:
        job_pk = int(job_id)
    except ValueError:
        return {"error": "invalid_id"}
    row = await db.get(Job, job_pk)
    if row is None:
        return {"error": "not_found"}
    return {
        "id": row.id,
        "title": row.title,
        "company": row.company,
        "description": row.description,
        "location": row.location,
        "apply_url": row.apply_url,
        "posted_at": row.posted_at.isoformat(),
    }


@router.post("/ingest/remoteok")
async def ingest_remoteok(db: AsyncSession = Depends(get_db_session)) -> dict[str, int]:
    # RemoteOK exposes a public JSON feed.
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get("https://remoteok.com/api")
        response.raise_for_status()
        payload = response.json()

    inserted = 0
    for item in payload:
        if not isinstance(item, dict) or "id" not in item:
            continue
        posted = item.get("date")
        if not posted:
            continue
        try:
            posted_at = datetime.fromisoformat(str(posted).replace("Z", "+00:00"))
        except ValueError:
            posted_at = datetime.now(tz=timezone.utc)

        title = str(item.get("position") or item.get("role") or "Untitled Role")
        company = str(item.get("company") or "Unknown Company")
        description = str(item.get("description") or "")
        location = str(item.get("location") or "Remote")
        apply_url = str(item.get("apply_url") or item.get("url") or "https://remoteok.com")

        stmt = insert(Job).values(
            source="remoteok",
            external_id=str(item["id"]),
            title=title,
            company=company,
            location=location,
            description=description,
            apply_url=apply_url,
            posted_at=posted_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["source", "external_id"],
            set_={
                "title": title,
                "company": company,
                "location": location,
                "description": description,
                "apply_url": apply_url,
                "posted_at": posted_at,
            },
        )
        await db.execute(stmt)
        inserted += 1

    await db.commit()
    return {"ingested": inserted}
