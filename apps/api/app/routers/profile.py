from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_session
from app.models import User, UserProfile
from app.schemas import ProfileUpdateRequest
from app.services.matching import recompute_matches_for_user

router = APIRouter()


def _serialize_profile(user: User, profile: UserProfile) -> dict[str, object]:
    return {
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "headline": profile.headline,
        "country": profile.country,
        "preferred_countries": list(profile.preferred_countries or []),
        "cities": list(profile.cities or []),
        "experience_level": profile.experience_level,
        "years_experience": profile.years_experience,
        "preferred_roles": list(profile.preferred_roles or []),
        "technologies": list(profile.technologies or []),
        "languages": list(profile.languages or []),
        "salary_expectation": profile.salary_expectation,
        "salary_min": profile.salary_min,
        "salary_max": profile.salary_max,
        "salary_currency": profile.salary_currency,
        "visa_required": profile.visa_required,
        "remote_preference": profile.remote_preference,
        "onboarding_completed": user.onboarding_completed,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else "",
    }


async def _get_or_create_profile(user: User, db: AsyncSession) -> UserProfile:
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


def _apply_profile_fields(user: User, profile: UserProfile, payload: ProfileUpdateRequest) -> None:
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    profile.headline = payload.headline.strip()
    profile.country = payload.country.strip()
    profile.preferred_countries = payload.preferred_countries
    profile.cities = payload.cities
    profile.experience_level = payload.experience_level.strip()
    profile.years_experience = payload.years_experience
    profile.preferred_roles = payload.preferred_roles
    profile.technologies = payload.technologies
    profile.languages = payload.languages
    profile.salary_expectation = payload.salary_expectation.strip()
    profile.remote_preference = payload.remote_preference
    profile.visa_required = payload.visa_required
    profile.updated_at = datetime.now(tz=timezone.utc)


@router.get("")
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    profile = await _get_or_create_profile(current_user, db)
    return _serialize_profile(current_user, profile)


@router.put("")
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    profile = await _get_or_create_profile(current_user, db)
    _apply_profile_fields(current_user, profile, payload)
    await db.flush()
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return _serialize_profile(current_user, profile)


@router.post("/complete-onboarding")
async def complete_onboarding(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    profile = await _get_or_create_profile(current_user, db)
    _apply_profile_fields(current_user, profile, payload)
    current_user.onboarding_completed = True
    await db.flush()
    await recompute_matches_for_user(current_user.id, db)
    await db.commit()
    return _serialize_profile(current_user, profile)
