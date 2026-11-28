import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob
from app.geo import is_safe_outbound_https_url, sanitize_http_url


class CompanyCareerPagesAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        urls = [
            x.strip()
            for x in os.getenv("COMPANY_CAREER_PAGE_URLS", "").split(",")
            if is_safe_outbound_https_url(x)
        ]
        if not urls:
            return []

        jobs: list[NormalizedJob] = []
        link_regex = re.compile(r'href=["\']([^"\']+)["\']', flags=re.IGNORECASE)

        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
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
                    safe_link = sanitize_http_url(match)
                    if not safe_link:
                        continue
                    parsed = urlparse(safe_link)
                    title = parsed.path.strip("/").split("/")[-1].replace("-", " ").strip() or "Career Opportunity"
                    jobs.append(
                        NormalizedJob(
                            source="company_career_pages",
                            external_id=safe_link,
                            title=title.title(),
                            company=urlparse(page_url).netloc,
                            location="Europe",
                            posted_at=datetime.now(tz=timezone.utc).isoformat(),
                            description=f"Discovered from {page_url}",
                            apply_url=safe_link,
                        )
                    )
        return jobs
