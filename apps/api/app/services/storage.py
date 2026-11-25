import base64
import hashlib
from pathlib import Path

from cryptography.fernet import Fernet

from app.settings import settings


def _get_fernet() -> Fernet:
    raw = settings.cv_encryption_key.strip()
    if raw:
        try:
            return Fernet(raw.encode("utf-8"))
        except Exception:
            digest = hashlib.sha256(raw.encode("utf-8")).digest()
            return Fernet(base64.urlsafe_b64encode(digest))
    digest = hashlib.sha256(f"careerscout-cv:{settings.jwt_secret}".encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _resolve_blob_path(storage_path: str) -> Path:
    root = Path(settings.upload_dir).resolve()
    target = (root / storage_path).resolve()
    if root != target and root not in target.parents:
        raise ValueError("Invalid CV storage path")
    return target


def encrypt_and_save(user_id: int, checksum: str, raw: bytes) -> str:
    rel_path = f"{user_id}/{checksum}.enc"
    target = _resolve_blob_path(rel_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    token = _get_fernet().encrypt(raw)
    target.write_bytes(token)
    return rel_path


def read_and_decrypt(storage_path: str) -> bytes:
    target = _resolve_blob_path(storage_path)
    if not target.is_file():
        raise FileNotFoundError(f"CV blob missing: {storage_path}")
    return _get_fernet().decrypt(target.read_bytes())


def delete_blob(storage_path: str) -> None:
    try:
        target = _resolve_blob_path(storage_path)
        if target.is_file():
            target.unlink()
    except ValueError:
        pass
