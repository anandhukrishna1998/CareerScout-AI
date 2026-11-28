from datetime import datetime, timezone

from sqlalchemy import case, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CV, CVParsed, Job, JobMatch, UserProfile
from app.services.ai_client import score_jobs_batch


async def get_active_cv_profile(user_id: int, db: AsyncSession) -> dict[str, object] | None:
    cv = await db.scalar(
        select(CV)
        .where(CV.user_id == user_id)
        .order_by(desc(CV.is_primary), desc(CV.id))
    )
    if cv is not None:
        parsed = await db.scalar(select(CVParsed).where(CVParsed.cv_id == cv.id))
        if parsed is not None:
            return {
                "summary": parsed.summary,
                "skills": list(parsed.skills or []),
                "languages": list(parsed.languages or []),
                "years_experience": parsed.years_experience,
                "experience_level": parsed.experience_level,
            }

    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    if profile is not None and profile.technologies:
        return {
            "summary": profile.headline,
            "skills": list(profile.technologies or []),
            "languages": list(profile.languages or []),
            "years_experience": profile.years_experience,
            "experience_level": profile.experience_level,
        }
    return None


async def recompute_matches_for_user(
    user_id: int,
    db: AsyncSession,
    limit: int = 150,
) -> list[JobMatch]:
    cv_profile = await get_active_cv_profile(user_id, db)
    if cv_profile is None:
        return []

    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    prefers_france = profile is None or (
        profile.country.strip().lower() == "france"
        or any(str(c).strip().lower() == "france" for c in (profile.preferred_countries or []))
    )

    jobs = (
        await db.scalars(
            select(Job)
            .order_by(case((Job.country == "France", 0), else_=1), desc(Job.posted_at))
            .limit(limit)
        )
    ).all()
    if not jobs:
        return []

    payload_jobs = [
        {"title": j.title, "description": j.description, "location": j.location}
        for j in jobs
    ]
    scored_list = await score_jobs_batch(cv_profile=cv_profile, jobs=payload_jobs)

    existing_rows = (
        await db.scalars(select(JobMatch).where(JobMatch.user_id == user_id))
    ).all()
    by_job_id = {m.job_id: m for m in existing_rows}

    now = datetime.now(tz=timezone.utc)
    updated_matches: list[JobMatch] = []
    for job, scored in zip(jobs, scored_list):
        match = by_job_id.get(job.id)
        if match is None:
            match = JobMatch(user_id=user_id, job_id=job.id, score=0)
            db.add(match)
        base_score = int(scored.get("score", 0))
        france_bonus = 3 if prefers_france and job.country == "France" else 0
        match.score = min(100, base_score + france_bonus)
        match.skill_score = int(scored.get("skill_score", 0))
        match.semantic_score = int(scored.get("semantic_score", 0))
        match.experience_score = int(scored.get("experience_score", 0))
        match.matched_skills = list(scored.get("matched_skills", []))
        match.strengths = list(scored.get("strengths", []))
        match.missing_skills = list(scored.get("missing_skills", []))
        match.action_items = list(scored.get("action_items", []))
        match.explanation = str(scored.get("recommendation", ""))
        match.updated_at = now
        updated_matches.append(match)

    await db.flush()
    return updated_matches
