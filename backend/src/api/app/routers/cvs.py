from hashlib import sha256

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_session
from app.models import CV, CVParsed, User
from app.services.ai_client import parse_cv_text

router = APIRouter()


@router.post("/upload")
async def upload_cv(
    file: UploadFile = File(...),
    user_id: int = 1,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    allowed = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"}
    if (file.content_type or "") not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        user = User(id=user_id, email=f"user{user_id}@example.com", password_hash="placeholder", role="user")
        db.add(user)
        await db.flush()

    checksum = sha256(content).hexdigest()
    cv = CV(
        user_id=user_id,
        storage_path=f"private/cvs/{user_id}/{checksum}",
        mime_type=file.content_type or "application/octet-stream",
        checksum=checksum,
        encrypted=True,
    )
    db.add(cv)
    await db.flush()

    text = content.decode("utf-8", errors="ignore")
    parsed = await parse_cv_text(text=text)
    cv_parsed = CVParsed(
        cv_id=cv.id,
        summary=str(parsed.get("summary", "")),
        skills=list(parsed.get("skills", [])),
        languages=list(parsed.get("languages", [])),
        years_experience=int(parsed.get("years_experience", 0)),
    )
    db.add(cv_parsed)
    await db.commit()

    return {
        "cv_id": cv.id,
        "filename": file.filename,
        "status": "accepted",
        "parsed": {
            "skills": cv_parsed.skills,
            "languages": cv_parsed.languages,
            "years_experience": cv_parsed.years_experience,
        },
    }
