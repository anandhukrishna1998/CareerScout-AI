from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import EmailLog, Job, JobMatch, SavedJob, User
from app.services.matching import get_active_cv_profile

router = APIRouter()


@router.get("/overview")
async def analytics_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    jobs = (await db.scalars(select(Job))).all()
    matches = (
        await db.scalars(select(JobMatch).where(JobMatch.user_id == current_user.id))
    ).all()
    saved_rows = (
        await db.scalars(select(SavedJob).where(SavedJob.user_id == current_user.id))
    ).all()
    email_logs = (
        await db.scalars(select(EmailLog).where(EmailLog.user_id == current_user.id))
    ).all()

    cutoff_24h = datetime.now(tz=timezone.utc) - timedelta(hours=24)
    jobs_last_24h = sum(
        1
        for j in jobs
        if (j.posted_at if j.posted_at.tzinfo else j.posted_at.replace(tzinfo=timezone.utc))
        >= cutoff_24h
    )
    avg_score = round(sum(m.score for m in matches) / len(matches)) if matches else 0
    high_matches = sum(1 for m in matches if m.score >= 75)

    stage_counts = Counter(s.status for s in saved_rows)
    applied_count = sum(
        stage_counts[st] for st in ("applied", "interviewing", "offer")
    )

    buckets = [
        ("80-100", sum(1 for m in matches if m.score >= 80)),
        ("60-79", sum(1 for m in matches if 60 <= m.score < 80)),
        ("40-59", sum(1 for m in matches if 40 <= m.score < 60)),
        ("0-39", sum(1 for m in matches if m.score < 40)),
    ]

    source_counts = Counter(j.source for j in jobs if j.source)
    remote_counts = Counter(j.remote_mode for j in jobs if j.remote_mode)

    cv_profile = await get_active_cv_profile(current_user.id, db)
    cv_skills = {str(s).lower() for s in (cv_profile or {}).get("skills", [])}
    skill_counts: Counter[str] = Counter()
    for j in jobs:
        for s in j.skills or []:
            skill_counts[str(s)] += 1

    return {
        "kpis": {
            "total_jobs": len(jobs),
            "jobs_last_24h": jobs_last_24h,
            "average_match_score": avg_score,
            "high_match_jobs": high_matches,
            "saved_count": len(saved_rows),
            "applied_count": applied_count,
            "digests_sent": len(email_logs),
        },
        "score_distribution": [{"bucket": b, "count": c} for b, c in buckets],
        "jobs_by_source": [
            {"source": src, "count": cnt} for src, cnt in source_counts.most_common(8)
        ],
        "jobs_by_remote_mode": [
            {"mode": mode, "count": remote_counts.get(mode, 0)}
            for mode in ("remote", "hybrid", "onsite")
        ],
        "top_market_skills": [
            {"skill": sk, "count": cnt, "matched": sk.lower() in cv_skills}
            for sk, cnt in skill_counts.most_common(12)
        ],
        "application_funnel": [
            {"stage": stage, "count": stage_counts.get(stage, 0)}
            for stage in ("saved", "applied", "interviewing", "offer", "rejected")
        ],
    }
