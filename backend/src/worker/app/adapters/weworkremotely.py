from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class WeWorkRemotelyAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=24)
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
                    description=title,
                    apply_url=link,
                )
            )
        return jobs
