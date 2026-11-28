import os
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob
from app.geo import sanitize_company_slug

DEFAULT_FR_EU_LEVER_COMPANIES = "swile"


class LeverAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        raw = (os.getenv("LEVER_COMPANIES") or DEFAULT_FR_EU_LEVER_COMPANIES).strip()
        companies = [
            slug
            for c in raw.split(",")
            if (slug := sanitize_company_slug(c)) is not None
        ]
        if not companies:
            return []

        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=int(os.getenv("SCRAPE_HOURS_OLD", "24")))
        jobs: list[NormalizedJob] = []

        async with httpx.AsyncClient(timeout=30) as client:
            for company in companies:
                url = f"https://api.lever.co/v0/postings/{company}?mode=json"
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    payload = response.json()
                except Exception:
                    continue

                for item in payload:
                    created = str(item.get("createdAt", ""))
                    posted_at = datetime.now(tz=timezone.utc)
                    if created.isdigit():
                        posted_at = datetime.fromtimestamp(int(created) / 1000, tz=timezone.utc)
                    if posted_at < cutoff:
                        continue

                    jobs.append(
                        NormalizedJob(
                            source="lever",
                            external_id=str(item.get("id", "")),
                            title=str(item.get("text", "Untitled Role")),
                            company=company,
                            location=str((item.get("categories") or {}).get("location") or "Unknown"),
                            posted_at=posted_at.isoformat(),
                            description=str(item.get("descriptionPlain") or ""),
                            apply_url=str(item.get("hostedUrl") or ""),
                        )
                    )
        return jobs
