import os
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class RSSFeedAdapter(JobProviderAdapter):
    def __init__(self, source: str, feed_urls_env: str) -> None:
        self.source = source
        self.feed_urls_env = feed_urls_env

    async def search_recent_jobs(self) -> list[NormalizedJob]:
        feeds = [x.strip() for x in os.getenv(self.feed_urls_env, "").split(",") if x.strip()]
        if not feeds:
            return []

        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=int(os.getenv("SCRAPE_HOURS_OLD", "24")))
        jobs: list[NormalizedJob] = []

        async with httpx.AsyncClient(timeout=30) as client:
            for feed_url in feeds:
                try:
                    response = await client.get(feed_url)
                    response.raise_for_status()
                    root = ElementTree.fromstring(response.text)
                except Exception:
                    continue

                for item in root.findall(".//item"):
                    title = item.findtext("title", default="Untitled Role")
                    link = item.findtext("link", default=feed_url)
                    guid = item.findtext("guid", default=link)
                    description = item.findtext("description", default="")
                    pub_date = item.findtext("pubDate", default="")

                    posted_at = datetime.now(tz=timezone.utc)
                    if pub_date:
                        try:
                            posted_at = parsedate_to_datetime(pub_date)
                        except Exception:
                            pass
                    if posted_at < cutoff:
                        continue

                    contract_type = "Unknown"
                    text_to_search = f"{title} {description}".lower()
                    if "intern" in text_to_search or "stage" in text_to_search:
                        contract_type = "Stage/Internship"
                    elif "contract" in text_to_search or "cdd" in text_to_search:
                        contract_type = "CDD"
                    elif "alternance" in text_to_search or "apprentice" in text_to_search:
                        contract_type = "Alternance"
                    elif "fulltime" in text_to_search or "cdi" in text_to_search:
                        contract_type = "CDI"

                    jobs.append(
                        NormalizedJob(
                            source=self.source,
                            external_id=guid,
                            title=title,
                            company=self.source,
                            location="Unknown",
                            posted_at=posted_at.isoformat(),
                            description=description,
                            apply_url=link,
                            contract_type=contract_type,
                        )
                    )
        return jobs
