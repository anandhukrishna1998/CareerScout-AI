import html
import os
import re
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob

_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", raw or ""))).strip()


class WeWorkRemotelyAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        hours_old = int(os.getenv("SCRAPE_HOURS_OLD", "24"))
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours_old)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get("https://weworkremotely.com/remote-jobs.rss")
            response.raise_for_status()
            rss = response.text

        root = ElementTree.fromstring(rss)
        jobs: list[NormalizedJob] = []

        for item in root.findall(".//item"):
            guid = item.findtext("guid", default="")
            title = item.findtext("title", default="Untitled Role")
            link = item.findtext("link", default="https://weworkremotely.com")
            pub_date = item.findtext("pubDate", default="")
            description = _clean_html(item.findtext("description", default=title)) or title

            posted_at = datetime.now(tz=timezone.utc)
            if pub_date:
                try:
                    posted_at = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %z")
                except ValueError:
                    pass
            if posted_at < cutoff:
                continue

            company = title.split(":")[0].strip() if ":" in title else "Unknown"
            jobs.append(
                NormalizedJob(
                    source="weworkremotely",
                    external_id=guid or link,
                    title=title,
                    company=company,
                    location="Remote",
                    posted_at=posted_at.isoformat(),
                    description=description,
                    apply_url=link,
                )
            )
        return jobs
