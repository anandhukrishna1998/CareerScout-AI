import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.dependencies import get_db_session
from app.models import Job
from app.schemas import ScrapeRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_jobs(
    location: str | None = None,
    contract_type: str | None = None,
    technologies: str | None = Query(default=None),
    remote_mode: str | None = None,
    posting_age_hours: int = 24,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=posting_age_hours)
    query = select(Job).where(Job.posted_at >= cutoff)
    
    if location:
        query = query.where(Job.location.ilike(f"%{location}%"))
    if contract_type and contract_type != "All":
        query = query.where(Job.contract_type.ilike(contract_type))
        
    query = query.order_by(Job.posted_at.desc()).limit(50)
    rows = (await db.scalars(query)).all()

    return {
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "company": row.company,
                "location": row.location,
                "remote_mode": remote_mode or "remote/hybrid",
                "contract_type": row.contract_type,
                "source": row.source,
                "apply_url": row.apply_url,
                "posted_at": row.posted_at.isoformat(),
            }
            for row in rows
        ],
        "filters": {
            "location": location,
            "contract_type": contract_type,
            "technologies": technologies,
            "posting_age_hours": posting_age_hours,
        },
    }


@router.get("/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db_session)) -> dict[str, object]:
    try:
        job_pk = int(job_id)
    except ValueError:
        return {"error": "invalid_id"}
    row = await db.get(Job, job_pk)
    if row is None:
        return {"error": "not_found"}
    return {
        "id": row.id,
        "title": row.title,
        "company": row.company,
        "description": row.description,
        "location": row.location,
        "apply_url": row.apply_url,
        "posted_at": row.posted_at.isoformat(),
    }


@router.post("/ingest/remoteok")
async def ingest_remoteok(db: AsyncSession = Depends(get_db_session)) -> dict[str, int]:
    # RemoteOK exposes a public JSON feed.
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get("https://remoteok.com/api")
        response.raise_for_status()
        payload = response.json()

    inserted = 0
    for item in payload:
        if not isinstance(item, dict) or "id" not in item:
            continue
        posted = item.get("date")
        if not posted:
            continue
        try:
            posted_at = datetime.fromisoformat(str(posted).replace("Z", "+00:00"))
        except ValueError:
            posted_at = datetime.now(tz=timezone.utc)

        title = str(item.get("position") or item.get("role") or "Untitled Role")
        company = str(item.get("company") or "Unknown Company")
        description = str(item.get("description") or "")
        location = str(item.get("location") or "Remote")
        apply_url = str(item.get("apply_url") or item.get("url") or "https://remoteok.com")

        stmt = insert(Job).values(
            source="remoteok",
            external_id=str(item["id"]),
            title=title,
            company=company,
            location=location,
            description=description,
            apply_url=apply_url,
            posted_at=posted_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["source", "external_id"],
            set_={
                "title": title,
                "company": company,
                "location": location,
                "description": description,
                "apply_url": apply_url,
                "posted_at": posted_at,
            },
        )
        await db.execute(stmt)
        inserted += 1

    await db.commit()
    return {"ingested": inserted}

async def perform_on_demand_scrape(keyword: str, location: str) -> None:
    try:
        from jobspy import scrape_jobs
    except ImportError:
        logger.error("jobspy is not installed")
        return
        
    try:
        # Run synchronous jobspy in a separate thread so it doesn't block the event loop
        results = await asyncio.to_thread(
            scrape_jobs,
            site_name=["linkedin", "indeed", "google"],
            search_term=keyword,
            location=location,
            results_wanted=15,
            country_indeed="france",
        )
    except Exception as exc:
        logger.error(f"jobspy failed: {exc}")
        return

    async with SessionLocal() as db:
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
                
            posted_date = str(row.get("date_posted") or row.get("date") or "1970-01-01T00:00:00+00:00")
            try:
                posted_at = datetime.fromisoformat(posted_date.replace("Z", "+00:00"))
            except ValueError:
                posted_at = datetime.now(tz=timezone.utc)
                
            external_id = str(row.get("id") or row.get("job_url") or row.get("title") or "unknown")
            source = "on_demand"
            
            stmt = insert(Job).values(
                source=source,
                external_id=external_id,
                title=str(row.get("title") or "Untitled Role"),
                company=str(row.get("company") or "Unknown"),
                location=str(row.get("location") or "Unknown"),
                description=str(row.get("description") or ""),
                apply_url=str(row.get("job_url") or ""),
                posted_at=posted_at,
                contract_type=contract_type,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_={
                    "title": stmt.excluded.title,
                    "company": stmt.excluded.company,
                    "location": stmt.excluded.location,
                    "description": stmt.excluded.description,
                    "apply_url": stmt.excluded.apply_url,
                    "posted_at": stmt.excluded.posted_at,
                    "contract_type": stmt.excluded.contract_type,
                },
            )
            await db.execute(stmt)
        await db.commit()

@router.post("/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(perform_on_demand_scrape, request.keyword, request.location)
    return {"status": "scraping_started"}


@router.get("/suggestions/autocomplete")
async def get_suggestions(
    type: str = Query(..., description="Either 'keyword' or 'location'"),
    q: str = Query("", description="The partial search string"),
    db: AsyncSession = Depends(get_db_session)
) -> dict[str, list[str]]:
    query_lower = q.lower().strip()
    if not query_lower:
        return {"suggestions": []}

    suggestions = set()

    if type == "keyword":
        # Predefined comprehensive list of tech roles
        tech_roles = [
            "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
            "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer",
            "AI Engineer", "AI Researcher", "DevOps Engineer", "Cloud Architect",
            "Product Manager", "UI/UX Designer", "Cybersecurity Analyst", "System Administrator",
            "Mobile Developer", "iOS Developer", "Android Developer", "QA Engineer"
        ]
        # Add matching predefined roles
        for role in tech_roles:
            if query_lower in role.lower():
                suggestions.add(role)
        
        # Query DB for matching job titles
        stmt = select(Job.title).where(Job.title.ilike(f"%{query_lower}%")).distinct().limit(10)
        db_roles = (await db.scalars(stmt)).all()
        for r in db_roles:
            suggestions.add(r)
            
    elif type == "location":
        # Predefined hubs
        hubs = [
            "Remote", "Paris", "London", "Berlin", "Amsterdam", "New York", 
            "San Francisco", "Austin", "Toronto", "Sydney", "Singapore", "Dubai", "Remote (France)"
        ]
        for hub in hubs:
            if query_lower in hub.lower():
                suggestions.add(hub)
        
        # Query DB for matching locations
        stmt = select(Job.location).where(Job.location.ilike(f"%{query_lower}%")).distinct().limit(10)
        db_locs = (await db.scalars(stmt)).all()
        for l in db_locs:
            if l:
                suggestions.add(l)

    # Sort and return top 10
    sorted_suggestions = sorted(list(suggestions), key=lambda x: (not x.lower().startswith(query_lower), x))
    return {"suggestions": sorted_suggestions[:10]}
