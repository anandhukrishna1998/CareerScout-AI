from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CV, ChatMessage, User

PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free": {"max_cvs": 5, "daily_ai_messages": 40},
    "pro": {"max_cvs": 25, "daily_ai_messages": 500},
}


def get_plan_limits(plan: str) -> dict[str, int]:
    return PLAN_LIMITS.get(plan.lower(), PLAN_LIMITS["free"])


async def enforce_cv_quota(user: User, db: AsyncSession) -> None:
    limits = get_plan_limits(user.plan)
    count = await db.scalar(select(func.count(CV.id)).where(CV.user_id == user.id)) or 0
    if count >= limits["max_cvs"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"CV limit reached ({limits['max_cvs']} on {user.plan} plan). Delete an older CV or upgrade.",
        )


async def enforce_ai_chat_quota(user: User, db: AsyncSession) -> None:
    limits = get_plan_limits(user.plan)
    since = datetime.now(tz=timezone.utc) - timedelta(hours=24)
    count = (
        await db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.user_id == user.id,
                ChatMessage.role == "user",
                ChatMessage.created_at >= since,
            )
        )
        or 0
    )
    if count >= limits["daily_ai_messages"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily AI message quota reached ({limits['daily_ai_messages']} on {user.plan} plan).",
        )
