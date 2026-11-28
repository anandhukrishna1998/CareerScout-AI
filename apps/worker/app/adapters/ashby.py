import html
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob
from app.geo import sanitize_company_slug

_TAG_RE = re.compile(r"<[^>]+>")
DEFAULT_FR_EU_ASHBY_COMPANIES = "alan,pennylane,dust,nabla,photoroom,deepl"


def _clean_html(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", raw or ""))).strip()


class AshbyAdapter(JobProviderAdapter):
    """Fetch public job postings from French & European companies using Ashby ATS."""

    async def search_recent_jobs(self) -> list[NormalizedJob]:
        raw = (os.getenv("ASHBY_COMPANIES") or DEFAULT_FR_EU_ASHBY_COMPANIES).strip()
        companies = [
            slug
            for item in raw.split(",")
            if (slug := sanitize_company_slug(item)) is not None
        ]
        if not companies:
            return []

        cutoff = datetime.now(tz=timezone.utc) - timedelta(
            hours=int(os.getenv("SCRAPE_HOURS_OLD", "24"))
        )
        jobs: list[NormalizedJob] = []

        async with httpx.AsyncClient(timeout=25) as client:
            for company in companies:
                url = f"https://api.ashbyhq.com/posting-api/job-board/{company}"
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    payload = response.json()
                except Exception:
                    continue

                for item in payload.get("jobs", []):
                    published = str(item.get("publishedAt") or "")
                    posted_at = datetime.now(tz=timezone.utc)
                    if published:
                        try:
                            posted_at = datetime.fromisoformat(published.replace("Z", "+00:00"))
                        except ValueError:
                            pass
                    if posted_at < cutoff:
                        continue

                    description = _clean_html(
                        str(item.get("descriptionPlain") or item.get("descriptionHtml") or "")
                    ) or str(item.get("title") or "")
                    jobs.append(
                        NormalizedJob(
                            source="ashby",
                            external_id=str(item.get("id") or item.get("jobUrl") or ""),
                            title=str(item.get("title") or "Untitled Role"),
                            company=company.title(),
                            location=str(item.get("location") or "Paris, France"),
                            posted_at=posted_at.isoformat(),
                            description=description,
                            apply_url=str(item.get("applyUrl") or item.get("jobUrl") or ""),
                        )
                    )
        return jobs
