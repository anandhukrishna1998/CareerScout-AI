import logging
import os

from app.adapters.base import NormalizedJob
from app.adapters.company_pages import CompanyCareerPagesAdapter
from app.adapters.greenhouse import GreenhouseAdapter
from app.adapters.lever import LeverAdapter
from app.adapters.remoteok import RemoteOkAdapter
from app.adapters.rss_feed import RSSFeedAdapter
from app.adapters.weworkremotely import WeWorkRemotelyAdapter
from app.sources import ALL_SOURCES, DEFAULT_BACKEND_CHAIN_BY_SOURCE, JOBSPY_SITE_MAPPING

logger = logging.getLogger("worker.orchestrator")


async def scrape_with_httpx(source: str) -> list[NormalizedJob]:
    if source == "remoteok":
        return await RemoteOkAdapter().search_recent_jobs()
    if source == "weworkremotely":
        return await WeWorkRemotelyAdapter().search_recent_jobs()
    if source == "greenhouse":
        return await GreenhouseAdapter().search_recent_jobs()
    if source == "lever":
        return await LeverAdapter().search_recent_jobs()

    if source == "company_career_pages":
        return await CompanyCareerPagesAdapter().search_recent_jobs()
    if source == "welcome_to_the_jungle":
        return await RSSFeedAdapter(source=source, feed_urls_env="WELCOME_TO_THE_JUNGLE_FEEDS").search_recent_jobs()
    if source == "hellowork":
        return await RSSFeedAdapter(source=source, feed_urls_env="HELLOWORK_FEEDS").search_recent_jobs()
    if source == "free_work":
        return await RSSFeedAdapter(source=source, feed_urls_env="FREE_WORK_FEEDS").search_recent_jobs()
    if source == "malt":
        return await RSSFeedAdapter(source=source, feed_urls_env="MALT_FEEDS").search_recent_jobs()
    return []


async def scrape_with_jobspy(source: str, search_term: str, location: str, hours_old: int) -> list[NormalizedJob]:
    site_name = JOBSPY_SITE_MAPPING.get(source)
    if site_name is None:
        return []

    try:
        from jobspy import scrape_jobs  # type: ignore
    except Exception as exc:  # pragma: no cover
        logger.warning("backend=jobspy source=%s status=unavailable error=%s", source, exc)
        return []

    try:
        results = scrape_jobs(
            site_name=[site_name],
            search_term=search_term,
            location=location,
            results_wanted=30,
            hours_old=hours_old,
            country_indeed="france",
        )
    except Exception as exc:
        logger.warning("backend=jobspy source=%s status=failed error=%s", source, exc)
        return []

    jobs: list[NormalizedJob] = []
    for _, row in results.iterrows():
        raw_type = str(row.get("job_type") or "").lower()
        if "intern" in raw_type or "stage" in raw_type:
            contract_type = "Stage/Internship"
        elif "contract" in raw_type or "cdd" in raw_type:
            contract_type = "CDD"
        elif "alternance" in raw_type or "apprentice" in raw_type:
            contract_type = "Alternance"
        elif "fulltime" in raw_type or "cdi" in raw_type:
            contract_type = "CDI"
        else:
            contract_type = "Unknown"

        jobs.append(
            NormalizedJob(
                source=source,
                external_id=str(row.get("id") or row.get("job_url") or row.get("title") or "unknown"),
                title=str(row.get("title") or "Untitled Role"),
                company=str(row.get("company") or "Unknown"),
                location=str(row.get("location") or "Unknown"),
                posted_at=str(row.get("date_posted") or row.get("date") or "1970-01-01T00:00:00+00:00"),
                description=str(row.get("description") or ""),
                apply_url=str(row.get("job_url") or ""),
                contract_type=contract_type,
            )
        )
    return jobs


async def scrape_with_scrapy(source: str) -> list[NormalizedJob]:
    # Scrapy package is part of dependencies; concrete spiders are added per source.
    # This fallback hook keeps the execution chain stable until full spiders are implemented.
    logger.info("backend=scrapy source=%s status=not_implemented", source)
    return []


async def scrape_with_playwright(source: str) -> list[NormalizedJob]:
    # Playwright backend is reserved for anti-bot or JS-heavy pages.
    logger.info("backend=playwright source=%s status=not_implemented", source)
    return []


def _backend_chain_for_source(source: str) -> list[str]:
    override_key = f"SCRAPE_BACKENDS_{source.upper()}"
    raw = os.getenv(override_key, "").strip()
    if raw:
        return [x.strip().lower() for x in raw.split(",") if x.strip()]
    return DEFAULT_BACKEND_CHAIN_BY_SOURCE.get(source, ["scrapy", "playwright"])


def _enabled_sources() -> list[str]:
    raw = os.getenv("SCRAPE_SOURCES", ",".join(ALL_SOURCES))
    requested = [x.strip().lower() for x in raw.split(",") if x.strip()]
    return [s for s in ALL_SOURCES if s in requested]


async def scrape_all_sources() -> dict[str, list[NormalizedJob]]:
    search_term = os.getenv("SCRAPE_SEARCH_TERM", "AI OR Data OR Machine Learning OR Software")
    location = os.getenv("SCRAPE_LOCATION", "France")
    hours_old = int(os.getenv("SCRAPE_HOURS_OLD", "24"))

    results: dict[str, list[NormalizedJob]] = {}
    for source in _enabled_sources():
        chain = _backend_chain_for_source(source)
        jobs: list[NormalizedJob] = []

        for backend in chain:
            if backend == "httpx":
                jobs = await scrape_with_httpx(source)
            elif backend == "jobspy":
                jobs = await scrape_with_jobspy(source, search_term=search_term, location=location, hours_old=hours_old)
            elif backend == "scrapy":
                jobs = await scrape_with_scrapy(source)
            elif backend == "playwright":
                jobs = await scrape_with_playwright(source)
            else:
                logger.warning("source=%s backend=%s status=unknown_backend", source, backend)
                continue

            logger.info("source=%s backend=%s jobs=%s", source, backend, len(jobs))
            if jobs:
                break

        results[source] = jobs
    return results
