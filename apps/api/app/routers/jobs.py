from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session, get_optional_user
from app.models import Job, JobMatch, SavedJob, User
from app.schemas import JobIngestRequest
from app.services.ingestion import ingest_sources, upsert_jobs
from app.services.matching import recompute_matches_for_user

router = APIRouter()


def _serialize_job_item(
    job: Job,
    match: JobMatch | None,
    saved: SavedJob | None,
) -> dict[str, object]:
    return {
        "id": job.id,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "country": job.country,
        "city": job.city,
        "remote_mode": job.remote_mode,
        "contract_type": job.contract_type,
        "experience_level": job.experience_level,
        "salary_text": job.salary_text,
        "skills": list(job.skills or []),
        "source": job.source,
        "apply_url": job.apply_url,
        "posted_at": job.posted_at.isoformat(),
        "score": match.score if match is not None else None,
        "matched_skills": list(match.matched_skills or []) if match is not None else [],
        "missing_skills": list(match.missing_skills or []) if match is not None else [],
        "is_saved": saved is not None,
        "saved_status": saved.status if saved is not None else None,
    }


@router.get("")
async def list_jobs(
    q: str | None = None,
    country: str | None = None,
    city: str | None = None,
    technologies: str | None = Query(default=None),
    remote_mode: str | None = None,
    source: str | None = None,
    posting_age_hours: int = Query(default=0, ge=0, le=8760),
    min_score: int = Query(default=0, ge=0, le=100),
    sort: str = "newest",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    stmt = select(Job)
    if posting_age_hours > 0:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=posting_age_hours)
        stmt = stmt.where(Job.posted_at >= cutoff)
    all_jobs = (await db.scalars(stmt.order_by(Job.posted_at.desc()))).all()

    available_sources = sorted({j.source for j in all_jobs if j.source})
    available_countries = sorted({j.country for j in all_jobs if j.country})

    matches_by_job: dict[int, JobMatch] = {}
    saved_by_job: dict[int, SavedJob] = {}
    if current_user is not None:
        m_rows = (
            await db.scalars(select(JobMatch).where(JobMatch.user_id == current_user.id))
        ).all()
        matches_by_job = {m.job_id: m for m in m_rows}
        s_rows = (
            await db.scalars(select(SavedJob).where(SavedJob.user_id == current_user.id))
        ).all()
        saved_by_job = {s.job_id: s for s in s_rows}

    q_lower = (q or "").strip().lower()
    country_lower = (country or "").strip().lower()
    city_lower = (city or "").strip().lower()
    tech_terms = [t.strip().lower() for t in (technologies or "").split(",") if t.strip()]
    remote_lower = (remote_mode or "").strip().lower()
    source_lower = (source or "").strip().lower()

    filtered: list[Job] = []
    for job in all_jobs:
        if q_lower:
            haystack = f"{job.title} {job.company} {job.description} {' '.join(job.skills or [])}".lower()
            if q_lower not in haystack:
                continue
        if country_lower and country_lower not in f"{job.country} {job.location}".lower():
            continue
        if city_lower and city_lower not in f"{job.city} {job.location}".lower():
            continue
        if remote_lower and remote_lower != "all" and job.remote_mode.lower() != remote_lower:
            continue
        if source_lower and source_lower != "all" and job.source.lower() != source_lower:
            continue
        if tech_terms:
            tech_blob = f"{job.title} {job.description} {' '.join(job.skills or [])}".lower()
            if not all(t in tech_blob for t in tech_terms):
                continue
        if min_score > 0:
            match = matches_by_job.get(job.id)
            if match is None or match.score < min_score:
                continue
        filtered.append(job)

    if sort == "score":
        filtered.sort(
            key=lambda j: (
                matches_by_job[j.id].score if j.id in matches_by_job else -1,
                j.posted_at.timestamp(),
            ),
            reverse=True,
        )
    elif sort == "company":
        filtered.sort(key=lambda j: (j.company.lower(), j.title.lower()))
    else:
        filtered.sort(key=lambda j: j.posted_at.timestamp(), reverse=True)

    total = len(filtered)
    total_pages = max(1, ceil(total / page_size)) if total > 0 else 1
    start = (page - 1) * page_size
    page_items = filtered[start : start + page_size]

    return {
        "items": [
            _serialize_job_item(j, matches_by_job.get(j.id), saved_by_job.get(j.id))
            for j in page_items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "available_sources": available_sources,
        "available_countries": available_countries,
    }


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    try:
        job_pk = int(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found") from exc

    row = await db.get(Job, job_pk)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    match: JobMatch | None = None
    saved: SavedJob | None = None
    if current_user is not None:
        match = await db.scalar(
            select(JobMatch).where(JobMatch.user_id == current_user.id, JobMatch.job_id == row.id)
        )
        saved = await db.scalar(
            select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == row.id)
        )

    payload = _serialize_job_item(row, match, saved)
    payload["description"] = row.description
    payload["match"] = (
        {
            "score": match.score,
            "skill_score": match.skill_score,
            "semantic_score": match.semantic_score,
            "experience_score": match.experience_score,
            "matched_skills": list(match.matched_skills or []),
            "strengths": list(match.strengths or []),
            "missing_skills": list(match.missing_skills or []),
            "action_items": list(match.action_items or []),
            "recommendation": match.explanation,
        }
        if match is not None
        else None
    )
    payload["saved"] = (
        {
            "status": saved.status,
            "notes": saved.notes,
            "applied_at": saved.applied_at.isoformat() if saved.applied_at else None,
        }
        if saved is not None
        else None
    )
    return payload


@router.post("/ingest")
async def ingest_jobs(
    payload: JobIngestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    total = await ingest_sources(
        db=db,
        sources=payload.sources,
        query=payload.query,
        hours_old=payload.hours_old,
    )
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return {"total_ingested": total, "query_used": payload.query}


@router.post("/ingest/remoteok")
async def ingest_remoteok(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    total = await ingest_sources(db=db, sources=["remoteok"], hours_old=720)
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return {"ingested": total}
