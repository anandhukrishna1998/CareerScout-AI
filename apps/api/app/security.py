from datetime import datetime, timedelta, timezone

from jose import jwt

from app.settings import settings


def _issue_token(subject: str, minutes: int, token_type: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(subject: str) -> str:
    return _issue_token(subject=subject, minutes=settings.jwt_access_ttl_minutes, token_type="access")


def create_refresh_token(subject: str) -> str:
    minutes = settings.jwt_refresh_ttl_days * 24 * 60
    return _issue_token(subject=subject, minutes=minutes, token_type="refresh")
