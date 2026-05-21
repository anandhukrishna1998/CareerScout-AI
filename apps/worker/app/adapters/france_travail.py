import os
from datetime import datetime, timedelta, timezone

import httpx

from app.adapters.base import JobProviderAdapter, NormalizedJob


class FranceTravailAdapter(JobProviderAdapter):
    async def search_recent_jobs(self) -> list[NormalizedJob]:
        token = os.getenv("FRANCE_TRAVAIL_ACCESS_TOKEN", "").strip()
        if not token:
            return []

        base_url = os.getenv("FRANCE_TRAVAIL_API_URL", "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search")
        keyword = os.getenv("SCRAPE_SEARCH_TERM", "data")
        location = os.getenv("SCRAPE_LOCATION", "France")
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=int(os.getenv("SCRAPE_HOURS_OLD", "24")))

        headers = {"Authorization": f"Bearer {token}"}
        params = {"motsCles": keyword, "lieux": location, "range": "0-49"}

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(base_url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()

        jobs: list[NormalizedJob] = []
        for item in payload.get("resultats", []):
            created = str(item.get("dateCreation", ""))
            posted_at = datetime.now(tz=timezone.utc)
            if created:
                try:
                    posted_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except ValueError:
                    pass
            if posted_at < cutoff:
                continue

            origin = item.get("origineOffre") or {}
            apply_url = ""
            if isinstance(origin, dict):
                apply_url = str(origin.get("urlOrigine") or origin.get("url") or "")

            jobs.append(
                NormalizedJob(
                    source="france_travail",
                    external_id=str(item.get("id", "")),
                    title=str(item.get("intitule", "Untitled Role")),
                    company=str((item.get("entreprise") or {}).get("nom") or "Unknown"),
                    location=str((item.get("lieuTravail") or {}).get("libelle") or "Unknown"),
                    posted_at=posted_at.isoformat(),
                    description=str(item.get("description") or ""),
                    apply_url=apply_url,
                )
            )
        return jobs
