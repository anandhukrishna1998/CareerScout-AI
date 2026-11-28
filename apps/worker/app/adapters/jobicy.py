import html
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob

_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", raw or ""))).strip()


class JobicyAdapter(JobProviderAdapter):
    """Fetch remote jobs specifically scoped to France first and broader Europe."""

    async def search_recent_jobs(self) -> list[NormalizedJob]:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(
            hours=int(os.getenv("SCRAPE_HOURS_OLD", "24"))
        )
        seen_ids: set[str] = set()
        jobs: list[NormalizedJob] = []

        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            for geo in ("france", "europe"):
                try:
                    response = await client.get(
                        "https://jobicy.com/api/v2/remote-jobs",
                        params={"count": 50, "geo": geo},
                    )
                    response.raise_for_status()
                    payload = response.json()
                except Exception:
                    continue

                for item in payload.get("jobs", []):
                    ext_id = str(item.get("id") or item.get("url") or "")
                    if not ext_id or ext_id in seen_ids:
                        continue
                    seen_ids.add(ext_id)

                    pub_raw = str(item.get("pubDate") or "")
                    posted_at = datetime.now(tz=timezone.utc)
                    if pub_raw:
                        try:
                            posted_at = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                        except ValueError:
                            pass
                    if posted_at < cutoff:
                        continue

                    raw_geo = str(item.get("jobGeo") or geo.title()).strip()
                    location = (
                        "Remote, France"
                        if geo == "france" and "france" not in raw_geo.lower()
                        else raw_geo
                    )
                    desc = _clean_html(str(item.get("jobDescription") or item.get("jobExcerpt") or ""))
                    jobs.append(
                        NormalizedJob(
                            source="jobicy",
                            external_id=ext_id,
                            title=html.unescape(str(item.get("jobTitle") or "Untitled Role")),
                            company=html.unescape(str(item.get("companyName") or "Unknown")),
                            location=location,
                            posted_at=posted_at.isoformat(),
                            description=desc,
                            apply_url=str(item.get("url") or ""),
                        )
                    )
        return jobs
