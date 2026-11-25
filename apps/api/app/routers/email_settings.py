from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import EmailLog, EmailSetting, Job, JobMatch, User
from app.schemas import EmailSettingsUpdateRequest
from app.services.emailer import dispatch_email_digest, render_digest_html

router = APIRouter()


async def _get_or_create_settings(user: User, db: AsyncSession) -> EmailSetting:
    row = await db.scalar(select(EmailSetting).where(EmailSetting.user_id == user.id))
    if row is None:
        row = EmailSetting(user_id=user.id, recipient_email=user.email)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _serialize_settings(row: EmailSetting) -> dict[str, object]:
    return {
        "digest_enabled": row.digest_enabled,
        "frequency": row.frequency,
        "send_hour": row.send_hour,
        "timezone": row.timezone,
        "min_match_score": row.min_match_score,
        "max_jobs_per_email": row.max_jobs_per_email,
        "subject_template": row.subject_template,
        "recipient_email": row.recipient_email,
        "last_sent_at": row.last_sent_at.isoformat() if row.last_sent_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


async def _build_digest_jobs(user: User, cfg: EmailSetting, db: AsyncSession) -> list[dict[str, object]]:
    matches = (
        await db.scalars(
            select(JobMatch)
            .where(JobMatch.user_id == user.id, JobMatch.score >= cfg.min_match_score)
            .order_by(desc(JobMatch.score))
            .limit(cfg.max_jobs_per_email)
        )
    ).all()
    if not matches:
        return []
    jobs = {
        j.id: j
        for j in (
            await db.scalars(select(Job).where(Job.id.in_([m.job_id for m in matches])))
        ).all()
    }
    items: list[dict[str, object]] = []
    for m in matches:
        j = jobs.get(m.job_id)
        if j is None:
            continue
        items.append(
            {
                "title": j.title,
                "company": j.company,
                "location": j.location,
                "score": m.score,
                "apply_url": j.apply_url,
                "matched_skills": list(m.matched_skills or []),
                "missing_skills": list(m.missing_skills or []),
            }
        )
    return items


@router.get("")
async def get_email_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    row = await _get_or_create_settings(current_user, db)
    return _serialize_settings(row)


@router.put("")
async def update_email_settings(
    payload: EmailSettingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    row = await _get_or_create_settings(current_user, db)
    row.digest_enabled = payload.digest_enabled
    row.frequency = payload.frequency
    row.send_hour = payload.send_hour
    row.timezone = payload.timezone
    row.min_match_score = payload.min_match_score
    row.max_jobs_per_email = payload.max_jobs_per_email
    row.subject_template = payload.subject_template
    row.recipient_email = payload.recipient_email
    row.updated_at = datetime.now(tz=timezone.utc)
    await db.commit()
    return _serialize_settings(row)


@router.get("/logs")
async def list_email_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, list[dict[str, object]]]:
    logs = (
        await db.scalars(
            select(EmailLog)
            .where(EmailLog.user_id == current_user.id)
            .order_by(desc(EmailLog.id))
            .limit(25)
        )
    ).all()
    return {
        "items": [
            {
                "id": log.id,
                "recipient_email": log.recipient_email,
                "subject": log.subject,
                "job_count": log.job_count,
                "status": log.status,
                "provider": log.provider,
                "error_message": log.error_message,
                "sent_at": log.sent_at.isoformat(),
            }
            for log in logs
        ]
    }


@router.get("/preview")
async def preview_email_digest(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cfg = await _get_or_create_settings(current_user, db)
    jobs = await _build_digest_jobs(current_user, cfg, db)
    html_body = render_digest_html(
        recipient_name=current_user.full_name or current_user.email,
        subject=cfg.subject_template,
        matches=jobs,
    )
    return {
        "recipient_email": cfg.recipient_email or current_user.email,
        "subject": cfg.subject_template,
        "job_count": len(jobs),
        "jobs": jobs,
        "html": html_body,
    }


@router.post("/test-digest")
async def send_test_digest(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cfg = await _get_or_create_settings(current_user, db)
    jobs = await _build_digest_jobs(current_user, cfg, db)
    recipient = cfg.recipient_email or current_user.email
    html_body = render_digest_html(
        recipient_name=current_user.full_name or current_user.email,
        subject=cfg.subject_template,
        matches=jobs,
    )
    status_str, provider, err = await dispatch_email_digest(
        recipient_email=recipient,
        subject=cfg.subject_template,
        html_body=html_body,
    )
    now = datetime.now(tz=timezone.utc)
    cfg.last_sent_at = now
    db.add(
        EmailLog(
            user_id=current_user.id,
            recipient_email=recipient,
            subject=cfg.subject_template,
            job_count=len(jobs),
            status=status_str,
            provider=provider,
            error_message=err,
            sent_at=now,
        )
    )
    await db.commit()
    return {
        "status": status_str,
        "provider": provider,
        "job_count": len(jobs),
        "preview_html": html_body,
    }
