import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import CV, CVParsed, User
from app.schemas import ChatRequest, ChatResponse
from app.settings import settings

router = APIRouter()

@router.post("", response_model=ChatResponse)
async def chat_with_assistant(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    # Get the user's latest CV to provide context
    latest_cv = await db.scalar(select(CV).where(CV.user_id == current_user.id).order_by(desc(CV.id)))
    cv_context = ""
    if latest_cv:
        parsed = await db.scalar(select(CVParsed).where(CVParsed.cv_id == latest_cv.id))
        if parsed:
            cv_context = (
                f"User Profile Context:\n"
                f"- Experience: {parsed.years_experience} years\n"
                f"- Skills: {', '.join(parsed.skills)}\n"
                f"- Languages: {', '.join(parsed.languages)}\n"
            )

    system_prompt = (
        "You are an expert AI Career Coach. "
        "Provide concise, actionable advice to help the user get a job in AI/Data.\n"
        f"{cv_context}\n"
        f"User question: {payload.message}"
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.ai_engine_url}/llm/generate",
                json={"prompt": system_prompt}
            )
            response.raise_for_status()
            data = response.json()
            return ChatResponse(reply=data.get("text", "I'm sorry, I couldn't generate a response."))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with AI engine: {str(e)}")
