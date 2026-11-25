from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import (
    CV,
    CVParsed,
    ChatMessage,
    EmailSetting,
    RefreshToken,
    SavedJob,
    User,
    UserProfile,
)
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.services.rate_limit import rate_limit_dependency
from app.settings import settings

router = APIRouter()


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        onboarding_completed=user.onboarding_completed,
    )


async def _issue_token_pair(user: User, db: AsyncSession) -> TokenPair:
    access = create_access_token(subject=user.email, user_id=user.id, role=user.role)
    refresh = create_refresh_token(subject=user.email, user_id=user.id, role=user.role)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.jwt_refresh_ttl_days)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            expires_at=expires_at,
        )
    )
    await db.commit()
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        user=_to_user_out(user),
    )


async def _ensure_user_defaults(user: User, db: AsyncSession) -> None:
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is None:
        db.add(
            UserProfile(
                user_id=user.id,
                headline="AI & Python Engineer",
                country="France",
                preferred_countries=["France", "Worldwide"],
                cities=["Paris", "Lyon"],
                experience_level="mid",
                years_experience=3,
                preferred_roles=["AI Engineer", "Machine Learning Engineer"],
                technologies=["Python", "FastAPI", "LLM", "SQL", "Docker"],
                languages=["English", "French"],
                salary_expectation="65k-85k EUR",
                remote_preference="hybrid",
            )
        )
    email_setting = await db.scalar(select(EmailSetting).where(EmailSetting.user_id == user.id))
    if email_setting is None:
        db.add(EmailSetting(user_id=user.id, recipient_email=user.email))


@router.post(
    "/register",
    response_model=TokenPair,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_dependency("auth-register", limit=15, window_seconds=60))],
)
async def register(
    payload: RegisterRequest, db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    normalized_email = payload.email.strip().lower()
    existing = await db.scalar(select(User).where(User.email == normalized_email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=normalized_email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
        onboarding_completed=False,
    )
    db.add(user)
    await db.flush()
    await _ensure_user_defaults(user, db)
    return await _issue_token_pair(user, db)


@router.post(
    "/login",
    response_model=TokenPair,
    dependencies=[Depends(rate_limit_dependency("auth-login", limit=20, window_seconds=60))],
)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db_session)) -> TokenPair:
    normalized_email = payload.email.strip().lower()
    user = await db.scalar(select(User).where(User.email == normalized_email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    await _ensure_user_defaults(user, db)
    return await _issue_token_pair(user, db)


@router.post(
    "/refresh",
    response_model=TokenPair,
    dependencies=[Depends(rate_limit_dependency("auth-refresh", limit=30, window_seconds=60))],
)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db_session)) -> TokenPair:
    try:
        decoded = decode_token(payload.refresh_token, expected_type="refresh")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from exc

    token_hash = hash_token(payload.refresh_token)
    stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    now = datetime.now(tz=timezone.utc)
    if stored is None or stored.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked.",
        )
    expires_at = stored.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired.",
        )

    user = await db.get(User, stored.user_id)
    if user is None or user.email != decoded.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    stored.revoked_at = now
    return await _issue_token_pair(user, db)


@router.post("/logout")
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db_session)) -> dict[str, bool]:
    if payload.refresh_token:
        token_hash = hash_token(payload.refresh_token)
        stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(tz=timezone.utc)
            await db.commit()
    return {"ok": True}


@router.post("/demo", response_model=TokenPair)
async def demo_login(db: AsyncSession = Depends(get_db_session)) -> TokenPair:
    if not settings.demo_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo workspace is disabled in production.",
        )

    demo_email = "ada@careerscout.ai"
    user = await db.scalar(select(User).where(User.email == demo_email))
    if user is None:
        user = User(
            email=demo_email,
            full_name="Ada Lovelace",
            password_hash=hash_password("demo-workspace-2026"),
            role="admin",
            plan="pro",
            onboarding_completed=True,
        )
        db.add(user)
        await db.flush()
    await _ensure_user_defaults(user, db)
    return await _issue_token_pair(user, db)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return _to_user_out(current_user)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True}


@router.get("/export")
async def export_account_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == current_user.id))
    cvs = (await db.scalars(select(CV).where(CV.user_id == current_user.id))).all()
    saved = (await db.scalars(select(SavedJob).where(SavedJob.user_id == current_user.id))).all()
    chats = (await db.scalars(select(ChatMessage).where(ChatMessage.user_id == current_user.id))).all()
    return {
        "user": _to_user_out(current_user).model_dump(),
        "profile": {
            "headline": profile.headline if profile else "",
            "country": profile.country if profile else "",
            "technologies": profile.technologies if profile else [],
        },
        "cvs": [{"id": c.id, "filename": c.filename, "mime_type": c.mime_type} for c in cvs],
        "saved_jobs": [{"job_id": s.job_id, "status": s.status, "notes": s.notes} for s in saved],
        "chat_messages": [{"role": m.role, "content": m.content} for m in chats],
    }


@router.delete("/me")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    cvs = (await db.scalars(select(CV).where(CV.user_id == current_user.id))).all()
    from app.services.storage import delete_blob

    for cv in cvs:
        delete_blob(cv.storage_path)
    await db.delete(current_user)
    await db.commit()
    return {"ok": True}
