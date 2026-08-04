import os
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class LeverAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        companies = [c.strip() for c in os.getenv("LEVER_COMPANIES", "").split(",") if c.strip()]
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
