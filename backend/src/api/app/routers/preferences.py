from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.dependencies import get_current_user, get_db_session
from app.models import UserPreference, User
from app.schemas import PreferenceSchema

router = APIRouter()

@router.get("", response_model=PreferenceSchema)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    query = select(UserPreference).where(UserPreference.user_id == current_user.id)
    pref = await db.scalar(query)
    
    if not pref:
        return {
            "country": "",
            "city": "",
            "technologies": [],
            "salary_expectation": 0,
            "remote_only": False,
            "visa_sponsorship_needed": False,
        }
    
    return {
        "country": pref.country,
        "city": pref.city,
        "technologies": pref.technologies,
        "salary_expectation": pref.salary_expectation,
        "remote_only": pref.remote_only,
        "visa_sponsorship_needed": pref.visa_sponsorship_needed,
    }


@router.put("", response_model=PreferenceSchema)
async def update_preferences(
    payload: PreferenceSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    stmt = insert(UserPreference).values(
        user_id=current_user.id,
        country=payload.country,
        city=payload.city,
        technologies=payload.technologies,
        salary_expectation=payload.salary_expectation,
        remote_only=payload.remote_only,
        visa_sponsorship_needed=payload.visa_sponsorship_needed,
    ).on_conflict_do_update(
        index_elements=["user_id"],
        set_={
            "country": payload.country,
            "city": payload.city,
            "technologies": payload.technologies,
            "salary_expectation": payload.salary_expectation,
            "remote_only": payload.remote_only,
            "visa_sponsorship_needed": payload.visa_sponsorship_needed,
        }
    )
    
    await db.execute(stmt)
    await db.commit()
    
    return payload.dict()
