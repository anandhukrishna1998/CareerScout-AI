from fastapi import APIRouter

from app.schemas import LoginRequest, RegisterRequest, TokenPair
from app.security import create_access_token, create_refresh_token

router = APIRouter()


@router.post("/register", response_model=TokenPair)
async def register(payload: RegisterRequest) -> TokenPair:
    # TODO: persist user and hash password.
    return TokenPair(
        access_token=create_access_token(subject=payload.email),
        refresh_token=create_refresh_token(subject=payload.email),
    )


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest) -> TokenPair:
    # TODO: validate credentials with DB.
    return TokenPair(
        access_token=create_access_token(subject=payload.email),
        refresh_token=create_refresh_token(subject=payload.email),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: dict[str, str]) -> TokenPair:
    # TODO: validate refresh token and rotation strategy.
    email = payload.get("email", "user@example.com")
    return TokenPair(
        access_token=create_access_token(subject=email),
        refresh_token=create_refresh_token(subject=email),
    )
