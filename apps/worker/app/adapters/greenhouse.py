import html
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob
from app.geo import sanitize_company_slug

_TAG_RE = re.compile(r"<[^>]+>")
DEFAULT_FR_EU_GREENHOUSE_COMPANIES = "algolia,mirakl,datacamp"


def _clean_html(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", raw or ""))).strip()


class GreenhouseAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        raw = (os.getenv("GREENHOUSE_COMPANIES") or DEFAULT_FR_EU_GREENHOUSE_COMPANIES).strip()
        companies = [
            slug
            for c in raw.split(",")
            if (slug := sanitize_company_slug(c)) is not None
        ]
        if not companies:
            return []

        cutoff = datetime.now(tz=timezone.utc) - timedelta(
            hours=int(os.getenv("SCRAPE_HOURS_OLD", "24"))
        )
        jobs: list[NormalizedJob] = []

        async with httpx.AsyncClient(timeout=30) as client:
            for company in companies:
                url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true"
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    payload = response.json()
                except Exception:
                    continue

                for item in payload.get("jobs", []):
                    updated = str(item.get("updated_at", ""))
                    posted_at = datetime.now(tz=timezone.utc)
                    if updated:
                        try:
                            posted_at = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                        except ValueError:
                            pass
                    if posted_at < cutoff:
                        continue

                    description = _clean_html(str(item.get("content") or "")) or str(
                        item.get("title", "")
                    )
                    jobs.append(
                        NormalizedJob(
                            source="greenhouse",
                            external_id=str(item.get("id", "")),
                            title=str(item.get("title", "Untitled Role")),
                            company=company,
                            location=str((item.get("location") or {}).get("name") or "Unknown"),
                            posted_at=posted_at.isoformat(),
                            description=description,
                            apply_url=str(item.get("absolute_url") or ""),
                        )
                    )
        return jobs
