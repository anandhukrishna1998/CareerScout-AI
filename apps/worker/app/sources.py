ALL_SOURCES = [
    "linkedin_jobs",
    "google_jobs",
    "welcome_to_the_jungle",
    "hellowork",
    "indeed",
    "apec",
    "france_travail",
    "monster",
    "free_work",
    "malt",
    "remoteok",
    "weworkremotely",
    "greenhouse",
    "lever",
    "company_career_pages",
]


DEFAULT_BACKEND_CHAIN_BY_SOURCE: dict[str, list[str]] = {
    "linkedin_jobs": ["jobspy", "scrapy", "playwright"],
    "google_jobs": ["httpx", "jobspy", "scrapy", "playwright"],
    "welcome_to_the_jungle": ["httpx", "scrapy", "playwright"],
    "hellowork": ["httpx", "scrapy", "playwright"],
    "indeed": ["jobspy", "scrapy", "playwright"],
    "apec": ["httpx", "scrapy", "playwright"],
    "france_travail": ["httpx", "scrapy", "playwright"],
    "monster": ["jobspy", "scrapy", "playwright"],
    "free_work": ["httpx", "scrapy", "playwright"],
    "malt": ["httpx", "scrapy", "playwright"],
    "remoteok": ["httpx", "scrapy", "playwright"],
    "weworkremotely": ["httpx", "scrapy", "playwright"],
    "greenhouse": ["httpx", "scrapy", "playwright"],
    "lever": ["httpx", "scrapy", "playwright"],
    "company_career_pages": ["httpx", "scrapy", "playwright"],
}


JOBSPY_SITE_MAPPING: dict[str, str] = {
    "linkedin_jobs": "linkedin",
    "indeed": "indeed",
    "monster": "monster",
}
