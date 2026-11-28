import re
from hashlib import sha256
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import CV, CVParsed, User
from app.schemas import CVFromTextRequest, CVParsedPatchRequest
from app.services.ai_client import parse_cv_text
from app.services.cv_extractor import (
    ALLOWED_CV_MIME_TYPES,
    CANONICAL_MIME_BY_EXT,
    extract_cv_text,
    validate_cv_magic_bytes,
)
from app.services.matching import recompute_matches_for_user
from app.services.quotas import enforce_cv_quota
from app.services.rate_limit import rate_limit_dependency
from app.services.storage import InvalidToken, delete_blob, encrypt_and_save, read_and_decrypt
from app.settings import settings

router = APIRouter()


def _sanitize_filename(raw: str) -> str:
    leaf = Path(raw or "resume.txt").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", leaf).strip("._")
    return (cleaned or "resume.txt")[:180]


def _serialize_cv(cv: CV, parsed: CVParsed | None) -> dict[str, object]:
    return {
        "id": cv.id,
        "filename": cv.filename,
        "mime_type": cv.mime_type,
        "file_size": cv.file_size,
        "is_primary": cv.is_primary,
        "encrypted": cv.encrypted,
        "created_at": cv.created_at.isoformat(),
        "parsed": {
            "summary": parsed.summary if parsed else "",
            "skills": list(parsed.skills or []) if parsed else [],
            "languages": list(parsed.languages or []) if parsed else [],
            "years_experience": parsed.years_experience if parsed else 0,
            "experience_level": parsed.experience_level if parsed else "mid",
            "suggested_roles": list(parsed.suggested_roles or []) if parsed else [],
        },
    }


async def _clear_primary_flag(user_id: int, db: AsyncSession) -> None:
    existing = (await db.scalars(select(CV).where(CV.user_id == user_id, CV.is_primary.is_(True)))).all()
    for item in existing:
        item.is_primary = False


async def _create_cv_record(
    *,
    user: User,
    filename: str,
    mime_type: str,
    content: bytes,
    extracted_text: str,
    set_primary: bool,
    db: AsyncSession,
) -> dict[str, object]:
    safe_filename = _sanitize_filename(filename)
    checksum = sha256(content).hexdigest()
    storage_path = encrypt_and_save(user.id, checksum, content)

    existing_count = (await db.scalars(select(CV).where(CV.user_id == user.id))).all()
    make_primary = set_primary or len(existing_count) == 0
    if make_primary:
        await _clear_primary_flag(user.id, db)

    cv = CV(
        user_id=user.id,
        filename=safe_filename,
        storage_path=storage_path,
        mime_type=mime_type,
        file_size=len(content),
        checksum=checksum,
        is_primary=make_primary,
        encrypted=True,
    )
    db.add(cv)
    await db.flush()

    parsed_data = await parse_cv_text(text=extracted_text)
    raw_years = parsed_data.get("years_experience", 0)
    years_exp = int(raw_years) if isinstance(raw_years, (int, float)) else 0
    cv_parsed = CVParsed(
        cv_id=cv.id,
        summary=str(parsed_data.get("summary", "")),
        skills=list(parsed_data.get("skills", [])),
        languages=list(parsed_data.get("languages", [])),
        years_experience=max(0, min(years_exp, 60)),
        experience_level=str(parsed_data.get("experience_level", "mid")),
        suggested_roles=list(parsed_data.get("suggested_roles", [])),
    )
    db.add(cv_parsed)
    await db.flush()
    if make_primary:
        await recompute_matches_for_user(user.id, db)
    await db.commit()
    await db.refresh(cv)
    return _serialize_cv(cv, cv_parsed)


@router.get("")
async def list_cvs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, list[dict[str, object]]]:
    cvs = (
        await db.scalars(
            select(CV)
            .where(CV.user_id == current_user.id)
            .order_by(desc(CV.is_primary), desc(CV.id))
        )
    ).all()
    if not cvs:
        return {"items": []}

    cv_ids = [c.id for c in cvs]
    parsed_rows = (await db.scalars(select(CVParsed).where(CVParsed.cv_id.in_(cv_ids)))).all()
    parsed_by_cv = {p.cv_id: p for p in parsed_rows}
    return {"items": [_serialize_cv(c, parsed_by_cv.get(c.id)) for c in cvs]}


@router.post(
    "/upload",
    dependencies=[Depends(rate_limit_dependency("cvs-upload", limit=25, window_seconds=60))],
)
async def upload_cv(
    file: UploadFile = File(...),
    set_primary: bool = Form(default=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    await enforce_cv_quota(current_user, db)
    filename = _sanitize_filename(file.filename or "resume.txt")
    content_type = (file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    ext = Path(filename).suffix.lower()

    if ext not in CANONICAL_MIME_BY_EXT:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if content_type not in ALLOWED_CV_MIME_TYPES and content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="Unsupported MIME content type")

    canonical_mime = CANONICAL_MIME_BY_EXT[ext]
    max_bytes = settings.upload_max_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.upload_max_mb} MB limit")

    try:
        validate_cv_magic_bytes(content, canonical_mime, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    extracted_text = extract_cv_text(content, canonical_mime, filename)
    if not extracted_text:
        raise HTTPException(status_code=400, detail="Could not extract readable text from CV")

    return await _create_cv_record(
        user=current_user,
        filename=filename,
        mime_type=canonical_mime,
        content=content,
        extracted_text=extracted_text,
        set_primary=set_primary,
        db=db,
    )


@router.post(
    "/from-text",
    dependencies=[Depends(rate_limit_dependency("cvs-upload", limit=25, window_seconds=60))],
)
async def create_cv_from_text(
    payload: CVFromTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    await enforce_cv_quota(current_user, db)
    raw_bytes = payload.text.encode("utf-8")
    return await _create_cv_record(
        user=current_user,
        filename=payload.filename.strip() or "pasted-cv.txt",
        mime_type="text/plain",
        content=raw_bytes,
        extracted_text=payload.text,
        set_primary=payload.set_primary,
        db=db,
    )


@router.post("/{cv_id}/primary")
async def set_primary_cv(
    cv_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cv = await db.scalar(select(CV).where(CV.id == cv_id, CV.user_id == current_user.id))
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    await _clear_primary_flag(current_user.id, db)
    cv.is_primary = True
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    parsed = await db.scalar(select(CVParsed).where(CVParsed.cv_id == cv.id))
    return _serialize_cv(cv, parsed)


@router.get("/{cv_id}/download")
async def download_cv(
    cv_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    cv = await db.scalar(select(CV).where(CV.id == cv_id, CV.user_id == current_user.id))
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    try:
        raw = read_and_decrypt(cv.storage_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV file missing") from exc
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to decrypt stored CV",
        ) from exc
    safe_name = _sanitize_filename(cv.filename)
    return Response(
        content=raw,
        media_type=cv.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.patch("/{cv_id}/parsed")
async def update_cv_parsed(
    cv_id: int,
    payload: CVParsedPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cv = await db.scalar(select(CV).where(CV.id == cv_id, CV.user_id == current_user.id))
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")

    parsed = await db.scalar(select(CVParsed).where(CVParsed.cv_id == cv.id))
    if parsed is None:
        parsed = CVParsed(cv_id=cv.id)
        db.add(parsed)

    parsed.summary = payload.summary
    parsed.skills = [s.strip() for s in payload.skills if s.strip()]
    parsed.years_experience = payload.years_experience
    if payload.languages is not None:
        parsed.languages = [lang.strip() for lang in payload.languages if lang.strip()]
    if payload.experience_level is not None:
        parsed.experience_level = payload.experience_level
    await db.flush()
    if cv.is_primary:
        await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return _serialize_cv(cv, parsed)


@router.delete("/{cv_id}")
async def delete_cv(
    cv_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    cv = await db.scalar(select(CV).where(CV.id == cv_id, CV.user_id == current_user.id))
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    was_primary = cv.is_primary
    storage_path = cv.storage_path
    await db.delete(cv)
    await db.flush()
    delete_blob(storage_path)

    if was_primary:
        replacement = await db.scalar(
            select(CV).where(CV.user_id == current_user.id).order_by(desc(CV.id))
        )
        if replacement is not None:
            replacement.is_primary = True
            await recompute_matches_for_user(current_user.id, db)

    await db.commit()
    return {"ok": True}
