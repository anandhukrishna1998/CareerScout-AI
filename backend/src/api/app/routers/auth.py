from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_session
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, TokenPair
from app.security import create_access_token, create_refresh_token
from app.services.auth import get_password_hash, verify_password

router = APIRouter()


@router.post("/register", response_model=TokenPair)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db_session)) -> TokenPair:
    existing_user = await db.scalar(select(User).where(User.email == payload.email))
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role="user"
    )
    db.add(user)
    await db.commit()

    return TokenPair(
        access_token=create_access_token(subject=payload.email),
        refresh_token=create_refresh_token(subject=payload.email),
    )


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db_session)) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenPair(
        access_token=create_access_token(subject=user.email),
        refresh_token=create_refresh_token(subject=user.email),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: dict[str, str]) -> TokenPair:
    # TODO: validate refresh token and rotation strategy.
    email = payload.get("email", "user@example.com")
    return TokenPair(
        access_token=create_access_token(subject=email),
        refresh_token=create_refresh_token(subject=email),
    )
