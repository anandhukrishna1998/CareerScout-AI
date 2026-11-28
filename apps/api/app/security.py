import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.settings import settings

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return f"scrypt${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    try:
        salt = bytes.fromhex(parts[1])
        expected = bytes.fromhex(parts[2])
    except ValueError:
        return False
    candidate = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return hmac.compare_digest(candidate, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_token(
    subject: str,
    minutes: int,
    token_type: str,
    user_id: int | None = None,
    role: str = "user",
    token_version: int = 1,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "role": role,
        "tv": token_version,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    if user_id is not None:
        payload["uid"] = user_id
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(
    subject: str, user_id: int | None = None, role: str = "user", token_version: int = 1
) -> str:
    return _issue_token(
        subject=subject,
        minutes=settings.jwt_access_ttl_minutes,
        token_type="access",
        user_id=user_id,
        role=role,
        token_version=token_version,
    )


def create_refresh_token(
    subject: str, user_id: int | None = None, role: str = "user", token_version: int = 1
) -> str:
    minutes = settings.jwt_refresh_ttl_days * 24 * 60
    return _issue_token(
        subject=subject,
        minutes=minutes,
        token_type="refresh",
        user_id=user_id,
        role=role,
        token_version=token_version,
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise ValueError("Invalid token type")
    if not payload.get("sub"):
        raise ValueError("Invalid token subject")
    return payload
