from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import Job, JobMatch, SavedJob, User
from app.schemas import SavedJobPatchRequest, SavedJobUpsertRequest

router = APIRouter()


def _serialize_saved(saved: SavedJob, job: Job, match: JobMatch | None) -> dict[str, object]:
    return {
        "id": saved.id,
        "job_id": saved.job_id,
        "status": saved.status,
        "notes": saved.notes,
        "applied_at": saved.applied_at.isoformat() if saved.applied_at else None,
        "created_at": saved.created_at.isoformat(),
        "updated_at": saved.updated_at.isoformat(),
        "job": {
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "country": job.country,
            "city": job.city,
            "remote_mode": job.remote_mode,
            "source": job.source,
            "apply_url": job.apply_url,
            "salary_text": job.salary_text,
            "posted_at": job.posted_at.isoformat(),
            "score": match.score if match is not None else None,
        },
    }


@router.get("")
async def list_saved_jobs(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, list[dict[str, object]]]:
    stmt = select(SavedJob).where(SavedJob.user_id == current_user.id)
    if status_filter and status_filter.strip().lower() != "all":
        stmt = stmt.where(SavedJob.status == status_filter.strip().lower())
    saved_rows = (
        await db.scalars(stmt.order_by(desc(SavedJob.updated_at), desc(SavedJob.id)))
    ).all()
    if not saved_rows:
        return {"items": []}

    job_ids = [s.job_id for s in saved_rows]
    jobs = {j.id: j for j in (await db.scalars(select(Job).where(Job.id.in_(job_ids)))).all()}
    matches = {
        m.job_id: m
        for m in (
            await db.scalars(
                select(JobMatch).where(
                    JobMatch.user_id == current_user.id, JobMatch.job_id.in_(job_ids)
                )
            )
        ).all()
    }
    return {
        "items": [
            _serialize_saved(s, jobs[s.job_id], matches.get(s.job_id))
            for s in saved_rows
            if s.job_id in jobs
        ]
    }


@router.post("")
async def upsert_saved_job(
    payload: SavedJobUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    job = await db.get(Job, payload.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    now = datetime.now(tz=timezone.utc)
    row = await db.scalar(
        select(SavedJob).where(
            SavedJob.user_id == current_user.id, SavedJob.job_id == payload.job_id
        )
    )
    if row is None:
        row = SavedJob(
            user_id=current_user.id,
            job_id=payload.job_id,
            status=payload.status,
            notes=payload.notes or "",
            applied_at=now if payload.status == "applied" else None,
        )
        db.add(row)
    else:
        row.status = payload.status
        if payload.notes is not None:
            row.notes = payload.notes
        if payload.status == "applied" and row.applied_at is None:
            row.applied_at = now
        row.updated_at = now

    await db.commit()
    await db.refresh(row)
    return {
        "id": row.id,
        "job_id": row.job_id,
        "status": row.status,
        "notes": row.notes,
        "applied_at": row.applied_at.isoformat() if row.applied_at else None,
    }


@router.patch("/{job_id}")
async def patch_saved_job(
    job_id: int,
    payload: SavedJobPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    row = await db.scalar(
        select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved job not found")

    now = datetime.now(tz=timezone.utc)
    if payload.status is not None:
        row.status = payload.status
        if payload.status == "applied" and row.applied_at is None:
            row.applied_at = now
    if payload.notes is not None:
        row.notes = payload.notes
    row.updated_at = now
    await db.commit()
    return {
        "ok": True,
        "status": row.status,
        "notes": row.notes,
        "applied_at": row.applied_at.isoformat() if row.applied_at else None,
    }


@router.delete("/{job_id}")
async def delete_saved_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    row = await db.scalar(
        select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved job not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
