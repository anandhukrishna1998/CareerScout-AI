from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import asc, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import ChatMessage, Job, User
from app.schemas import AIChatRequest, CoverLetterRequest
from app.services.ai_client import generate_chat_reply, generate_cover_letter
from app.services.matching import get_active_cv_profile
from app.services.quotas import enforce_ai_chat_quota
from app.services.rate_limit import rate_limit_dependency

router = APIRouter()


def _serialize_message(msg: ChatMessage) -> dict[str, object]:
    return {
        "id": msg.id,
        "role": msg.role,
        "content": msg.content,
        "job_id": msg.job_id,
        "created_at": msg.created_at.isoformat(),
    }


@router.post(
    "/cover-letter",
    dependencies=[Depends(rate_limit_dependency("ai-cover-letter", limit=20, window_seconds=60))],
)
async def create_cover_letter(
    payload: CoverLetterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    job = await db.get(Job, payload.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    cv_profile = await get_active_cv_profile(current_user.id, db) or {}
    letter = await generate_cover_letter(
        cv_profile=cv_profile,
        job={"title": job.title, "company": job.company, "description": job.description},
        tone=payload.tone,
    )
    return {"cover_letter": letter}


@router.get("/chat/history")
async def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, list[dict[str, object]]]:
    rows = (
        await db.scalars(
            select(ChatMessage)
            .where(ChatMessage.user_id == current_user.id)
            .order_by(asc(ChatMessage.id))
            .limit(100)
        )
    ).all()
    return {"items": [_serialize_message(r) for r in rows]}


@router.delete("/chat/history")
async def clear_chat_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == current_user.id))
    await db.commit()
    return {"ok": True}


@router.post(
    "/chat",
    dependencies=[Depends(rate_limit_dependency("ai-chat", limit=30, window_seconds=60))],
)
async def send_chat_message(
    payload: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    await enforce_ai_chat_quota(current_user, db)
    cv_profile = await get_active_cv_profile(current_user.id, db)

    job_ctx: dict[str, object] | None = None
    if payload.job_id is not None:
        job = await db.get(Job, payload.job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        job_ctx = {
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "description": job.description,
            "location": job.location,
        }

    user_msg = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=payload.message.strip(),
        job_id=payload.job_id,
    )
    db.add(user_msg)
    await db.flush()

    reply_text = await generate_chat_reply(
        message=payload.message,
        cv_profile=cv_profile,
        job=job_ctx,
    )
    assistant_msg = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        content=reply_text,
        job_id=payload.job_id,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)
    return {
        "reply": reply_text,
        "message": _serialize_message(assistant_msg),
    }
