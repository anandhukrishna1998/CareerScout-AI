from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from app.dependencies import get_current_user, get_db_session
from app.models import SavedJob, Job, User
from app.schemas import SavedJobResponse

router = APIRouter()


@router.get("", response_model=list[SavedJobResponse])
async def list_saved_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[SavedJobResponse]:
    query = (
        select(SavedJob, Job)
        .join(Job, SavedJob.job_id == Job.id)
        .where(SavedJob.user_id == current_user.id)
        .order_by(SavedJob.saved_at.desc())
    )
    rows = (await db.execute(query)).all()

    return [
        SavedJobResponse(
            id=saved_job.id,
            job_id=job.id,
            title=job.title,
            company=job.company,
            location=job.location,
            apply_url=job.apply_url,
            saved_at=saved_job.saved_at.isoformat()
        )
        for saved_job, job in rows
    ]


@router.post("/{job_id}", status_code=status.HTTP_201_CREATED)
async def save_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    # Check if job exists
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    saved_job = SavedJob(user_id=current_user.id, job_id=job_id)
    db.add(saved_job)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Already saved, return success anyway (idempotent)
    return {"status": "saved"}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    stmt = delete(SavedJob).where(
        and_(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id)
    )
    await db.execute(stmt)
    await db.commit()
