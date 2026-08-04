from dataclasses import dataclass


@dataclass
class NormalizedJob:
    source: str
    external_id: str
    title: str
    company: str
    location: str
    posted_at: str
    description: str
    apply_url: str


class JobProviderAdapter:
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        raise NotImplementedError
