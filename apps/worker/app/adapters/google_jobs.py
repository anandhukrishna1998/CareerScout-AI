import os
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class GoogleJobsAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        api_key = os.getenv("SERPAPI_KEY", "").strip()
        if not api_key:
            return []

        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=int(os.getenv("SCRAPE_HOURS_OLD", "24")))
        params = {
            "engine": "google_jobs",
            "q": os.getenv("SCRAPE_SEARCH_TERM", "ai engineer"),
            "hl": "en",
            "api_key": api_key,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get("https://serpapi.com/search.json", params=params)
            response.raise_for_status()
            payload = response.json()

        jobs: list[NormalizedJob] = []
        for item in payload.get("jobs_results", []):
            posted_at = datetime.now(tz=timezone.utc)
            detected = str(item.get("detected_extensions", {}).get("posted_at", ""))
            if "day" in detected or "hour" in detected:
                posted_at = datetime.now(tz=timezone.utc)
            if posted_at < cutoff:
                continue

            related = item.get("related_links")
            first_link = related[0] if isinstance(related, list) and related and isinstance(related[0], dict) else {}
            jobs.append(
                NormalizedJob(
                    source="google_jobs",
                    external_id=str(item.get("job_id") or item.get("title") or ""),
                    title=str(item.get("title") or "Untitled Role"),
                    company=str(item.get("company_name") or "Unknown"),
                    location=str(item.get("location") or "Unknown"),
                    posted_at=posted_at.isoformat(),
                    description=str(item.get("description") or ""),
                    apply_url=str(first_link.get("link") or ""),
                )
            )
        return jobs
