from typing import Any

import httpx

from app.settings import settings


async def parse_cv_text(text: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{settings.ai_engine_url}/cv/parse", json={"text": text})
        response.raise_for_status()
        return response.json()


async def score_job(cv_profile: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "cv_profile": cv_profile,
        "job": {
            "title": job["title"],
            "description": job["description"],
            "location": job.get("location", ""),
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{settings.ai_engine_url}/ats/score-job", json=payload)
        response.raise_for_status()
        return response.json()
