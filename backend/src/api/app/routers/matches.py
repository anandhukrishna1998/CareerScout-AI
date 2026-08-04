from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import CV, CVParsed, Job, User
from app.schemas import JobMatchResponse
from app.services.ai_client import score_job

router = APIRouter()


@router.get("/daily", response_model=list[JobMatchResponse])
async def daily_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> list[JobMatchResponse]:
    latest_cv = await db.scalar(select(CV).where(CV.user_id == current_user.id).order_by(desc(CV.id)))
    if latest_cv is None:
        return []

    parsed = await db.scalar(select(CVParsed).where(CVParsed.cv_id == latest_cv.id))
    if parsed is None:
        return []

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=24)
    jobs = (await db.scalars(select(Job).where(Job.posted_at >= cutoff).order_by(Job.posted_at.desc()).limit(25))).all()

    cv_profile = {
        "summary": parsed.summary,
        "skills": parsed.skills,
        "languages": parsed.languages,
        "years_experience": parsed.years_experience,
    }
    results: list[JobMatchResponse] = []
    for job in jobs:
        scored = await score_job(
            cv_profile=cv_profile,
            job={"title": job.title, "description": job.description, "location": job.location},
        )
        results.append(
            JobMatchResponse(
                job_id=job.id,
                title=job.title,
                company=job.company,
                location=job.location,
                apply_url=job.apply_url,
                score=int(scored.get("score", 0)),
                strengths=list(scored.get("strengths", [])),
                missing_skills=list(scored.get("missing_skills", [])),
                recommendation=str(scored.get("recommendation", "Match pending")),
            )
        )

    results.sort(key=lambda x: x.score, reverse=True)
    return results[:10]
