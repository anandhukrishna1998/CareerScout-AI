import html
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob

_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", raw or ""))).strip()


class RemoteOkAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        hours_old = int(os.getenv("SCRAPE_HOURS_OLD", "24"))
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours_old)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get("https://remoteok.com/api")
            response.raise_for_status()
            payload = response.json()

        jobs: list[NormalizedJob] = []
        for item in payload:
            if not isinstance(item, dict) or "id" not in item:
                continue
            posted = str(item.get("date", ""))
            try:
                posted_at = datetime.fromisoformat(posted.replace("Z", "+00:00"))
            except ValueError:
                continue
            if posted_at < cutoff:
                continue

            jobs.append(
                NormalizedJob(
                    source="remoteok",
                    external_id=str(item["id"]),
                    title=str(item.get("position") or item.get("role") or "Untitled Role"),
                    company=str(item.get("company") or "Unknown"),
                    location=str(item.get("location") or "Remote"),
                    posted_at=posted_at.isoformat(),
                    description=_clean_html(str(item.get("description") or "")),
                    apply_url=str(
                        item.get("apply_url") or item.get("url") or "https://remoteok.com"
                    ),
                )
            )
        return jobs
