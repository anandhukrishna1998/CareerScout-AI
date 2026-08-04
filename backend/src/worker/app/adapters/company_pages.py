import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class CompanyCareerPagesAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        urls = [x.strip() for x in os.getenv("COMPANY_CAREER_PAGE_URLS", "").split(",") if x.strip()]
        if not urls:
            return []

        jobs: list[NormalizedJob] = []
        link_regex = re.compile(r'href=["\']([^"\']+)["\']', flags=re.IGNORECASE)

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            for page_url in urls:
                try:
                    response = await client.get(page_url)
                    response.raise_for_status()
                except Exception:
                    continue

                for match in link_regex.findall(response.text):
                    lower = match.lower()
                    if "job" not in lower and "career" not in lower and "position" not in lower:
                        continue
                    if not match.startswith("http"):
                        continue
                    parsed = urlparse(match)
                    title = parsed.path.strip("/").split("/")[-1].replace("-", " ").strip() or "Career Opportunity"
                    jobs.append(
                        NormalizedJob(
                            source="company_career_pages",
                            external_id=match,
                            title=title.title(),
                            company=urlparse(page_url).netloc,
                            location="Unknown",
                            posted_at=datetime.now(tz=timezone.utc).isoformat(),
                            description=f"Discovered from {page_url}",
                            apply_url=match,
                        )
                    )
        return jobs
