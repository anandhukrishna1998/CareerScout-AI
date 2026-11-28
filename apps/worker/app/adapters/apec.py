import os
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob
from app.geo import is_safe_outbound_https_url


class ApecAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        api_url = os.getenv("APEC_API_URL", "").strip()
        if not api_url or not is_safe_outbound_https_url(api_url):
            return []

        api_key = os.getenv("APEC_API_KEY", "").strip()
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=int(os.getenv("SCRAPE_HOURS_OLD", "24")))

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(api_url, headers=headers)
            response.raise_for_status()
            payload = response.json()

        jobs: list[NormalizedJob] = []
        items = payload.get("results") or payload.get("jobs") or []
        for item in items:
            posted_raw = str(item.get("posted_at") or item.get("datePublication") or "")
            posted_at = datetime.now(tz=timezone.utc)
            if posted_raw:
                try:
                    posted_at = datetime.fromisoformat(posted_raw.replace("Z", "+00:00"))
                except ValueError:
                    pass
            if posted_at < cutoff:
                continue

            jobs.append(
                NormalizedJob(
                    source="apec",
                    external_id=str(item.get("id") or item.get("reference") or ""),
                    title=str(item.get("title") or item.get("intitule") or "Untitled Role"),
                    company=str(item.get("company") or item.get("entreprise") or "Unknown"),
                    location=str(item.get("location") or item.get("lieu") or "Unknown"),
                    posted_at=posted_at.isoformat(),
                    description=str(item.get("description") or ""),
                    apply_url=str(item.get("url") or item.get("apply_url") or ""),
                )
            )
        return jobs
