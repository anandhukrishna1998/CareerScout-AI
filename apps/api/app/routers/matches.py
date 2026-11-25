from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import Job, JobMatch, SavedJob, User
from app.schemas import JobMatchResponse
from app.services.matching import get_active_cv_profile, recompute_matches_for_user

router = APIRouter()


@router.get("/daily", response_model=list[JobMatchResponse])
async def daily_matches(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[JobMatchResponse]:
    cv_profile = await get_active_cv_profile(current_user.id, db)
    if cv_profile is None:
        return []

    matches = (
        await db.scalars(
            select(JobMatch)
            .where(JobMatch.user_id == current_user.id)
            .order_by(desc(JobMatch.score))
            .limit(limit)
        )
    ).all()
    if not matches:
        await recompute_matches_for_user(current_user.id, db, limit=50)
        await db.commit()
        matches = (
            await db.scalars(
                select(JobMatch)
                .where(JobMatch.user_id == current_user.id)
                .order_by(desc(JobMatch.score))
                .limit(limit)
            )
        ).all()

    if not matches:
        return []

    job_ids = [m.job_id for m in matches]
    jobs = {j.id: j for j in (await db.scalars(select(Job).where(Job.id.in_(job_ids)))).all()}
    saved_ids = set(
        (
            await db.scalars(
                select(SavedJob.job_id).where(
                    SavedJob.user_id == current_user.id, SavedJob.job_id.in_(job_ids)
                )
            )
        ).all()
    )

    results: list[JobMatchResponse] = []
    for m in matches:
        job = jobs.get(m.job_id)
        if job is None:
            continue
        results.append(
            JobMatchResponse(
                job_id=job.id,
                title=job.title,
                company=job.company,
                location=job.location,
                country=job.country,
                city=job.city,
                remote_mode=job.remote_mode,
                source=job.source,
                apply_url=job.apply_url,
                posted_at=job.posted_at.isoformat(),
                salary_text=job.salary_text,
                is_saved=job.id in saved_ids,
                score=m.score,
                skill_score=m.skill_score,
                semantic_score=m.semantic_score,
                experience_score=m.experience_score,
                matched_skills=list(m.matched_skills or []),
                strengths=list(m.strengths or []),
                missing_skills=list(m.missing_skills or []),
                action_items=list(m.action_items or []),
                recommendation=m.explanation,
            )
        )
    return results


@router.get("/insights")
async def match_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cv_profile = await get_active_cv_profile(current_user.id, db)
    cv_skills = list(cv_profile.get("skills", [])) if cv_profile else []
    cv_lower = {str(s).lower() for s in cv_skills}

    matches = (
        await db.scalars(select(JobMatch).where(JobMatch.user_id == current_user.id))
    ).all()
    if not matches and cv_profile is not None:
        matches = await recompute_matches_for_user(current_user.id, db, limit=50)
        await db.commit()

    jobs = (await db.scalars(select(Job).order_by(desc(Job.posted_at)).limit(100))).all()

    missing_counter: Counter[str] = Counter()
    matched_counter: Counter[str] = Counter()
    demand_counter: Counter[str] = Counter()

    for m in matches:
        for s in m.missing_skills or []:
            missing_counter[str(s)] += 1
        for s in m.matched_skills or []:
            matched_counter[str(s)] += 1

    for j in jobs:
        for s in j.skills or []:
            demand_counter[str(s)] += 1

    avg_score = round(sum(m.score for m in matches) / len(matches)) if matches else 0
    jobs_analyzed = len(matches) or len(jobs)

    top_missing = [
        {
            "skill": skill,
            "demand_count": count,
            "impact": min(25, max(3, round(count / max(jobs_analyzed, 1) * 25))),
        }
        for skill, count in missing_counter.most_common(6)
    ]
    top_strengths = [
        {"skill": skill, "matched_count": count}
        for skill, count in matched_counter.most_common(8)
    ]
    market_demand = [
        {"skill": skill, "demand_count": count, "in_cv": skill.lower() in cv_lower}
        for skill, count in demand_counter.most_common(10)
    ]

    recommendations: list[str] = []
    if not cv_skills:
        recommendations.append("Upload a primary CV or add core technologies in Profile Settings.")
    if top_missing:
        recommendations.append(
            f"Prioritize {top_missing[0]['skill']} to unlock up to +{top_missing[0]['impact']}% average ATS boost."
        )
    if top_strengths:
        recommendations.append(
            f"Quantify production outcomes using {top_strengths[0]['skill']} in your CV summary."
        )

    return {
        "ats_readiness_score": avg_score,
        "jobs_analyzed": jobs_analyzed,
        "cv_skills_count": len(cv_skills),
        "top_missing_skills": top_missing,
        "top_strengths": top_strengths,
        "market_skill_demand": market_demand,
        "recommendations": recommendations,
    }
