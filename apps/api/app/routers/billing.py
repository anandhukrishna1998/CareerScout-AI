import hashlib
import hmac
import json
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import CV, ChatMessage, User
from app.services.quotas import get_plan_limits
from app.settings import settings

router = APIRouter()
_MAX_WEBHOOK_AGE_SECONDS = 300


def verify_stripe_signature(payload: bytes, sig_header: str, secret: str) -> bool:
    if not secret or not sig_header:
        return False
    timestamp: str | None = None
    v1_signatures: list[str] = []
    for item in sig_header.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            key = k.strip()
            val = v.strip()
            if key == "t":
                timestamp = val
            elif key == "v1" and val:
                v1_signatures.append(val)
    if not timestamp or not v1_signatures:
        return False
    try:
        ts_int = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - ts_int) > _MAX_WEBHOOK_AGE_SECONDS:
        return False
    signed_payload = f"{timestamp}.".encode("utf-8") + payload
    expected = hmac.new(
        secret.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in v1_signatures)


@router.get("/status")
async def billing_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cv_count = await db.scalar(select(func.count(CV.id)).where(CV.user_id == current_user.id)) or 0
    chat_count = (
        await db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.user_id == current_user.id, ChatMessage.role == "user"
            )
        )
        or 0
    )
    limits = get_plan_limits(current_user.plan)
    return {
        "plan": current_user.plan,
        "limits": limits,
        "usage": {"cvs": cv_count, "ai_messages": chat_count},
        "stripe_configured": bool(settings.stripe_secret_key.strip()),
    }


@router.post("/upgrade-demo")
async def upgrade_demo_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if not settings.demo_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo plan switching is disabled in production.",
        )
    current_user.plan = "pro" if current_user.plan == "free" else "free"
    await db.commit()
    return {"plan": current_user.plan, "limits": get_plan_limits(current_user.plan)}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default=""),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    body = await request.body()
    if not verify_stripe_signature(body, stripe_signature, settings.stripe_webhook_secret):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    try:
        event = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed webhook JSON") from exc
    event_type = event.get("type", "")
    data_obj = event.get("data", {}).get("object", {})
    customer_email = str(data_obj.get("customer_email") or "").strip().lower()
    if customer_email:
        user = await db.scalar(select(User).where(User.email == customer_email))
        if user is not None:
            if event_type in {"checkout.session.completed", "customer.subscription.updated"}:
                user.plan = "pro"
            elif event_type == "customer.subscription.deleted":
                user.plan = "free"
            await db.commit()
    return {"received": True}
