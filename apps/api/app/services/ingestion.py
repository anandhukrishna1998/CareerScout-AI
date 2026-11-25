import html
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from xml.etree import ElementTree

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job, ScrapeRun
from app.services.ai_client import extract_skills_local

_TAG_RE = re.compile(r"<[^>]+>")


def clean_html_text(raw: str) -> str:
    text = html.unescape(_TAG_RE.sub(" ", raw or ""))
    return re.sub(r"\s+", " ", text).strip()


def infer_remote_mode(location: str, title: str, description: str) -> str:
    blob = f"{location} {title} {description[:300]}".lower()
    if "hybrid" in blob:
        return "hybrid"
    if "remote" in blob or "worldwide" in blob or "anywhere" in blob:
        return "remote"
    return "onsite"


def parse_country_city(location: str) -> tuple[str, str]:
    clean = (location or "").strip()
    if not clean:
        return "Worldwide", "Remote"
    lower = clean.lower()
    if any(tok in lower for tok in ("worldwide", "anywhere", "remote only", "global")):
        return "Worldwide", "Remote"
    parts = [p.strip() for p in clean.split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[-1], parts[0]
    if lower in {"france", "germany", "united kingdom", "united states", "canada", "spain"}:
        return clean, ""
    if "paris" in lower or "lyon" in lower:
        return "France", clean
    return clean, clean


def _parse_iso_dt(raw: Any) -> datetime:
    if isinstance(raw, (int, float)):
        ts = float(raw)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    text = str(raw or "").strip()
    if not text:
        return datetime.now(tz=timezone.utc)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(tz=timezone.utc)


async def upsert_jobs(db: AsyncSession, items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    dialect = db.bind.dialect.name if db.bind is not None else ""
    count = 0
    for item in items:
        skills = item.get("skills") or extract_skills_local(
            f"{item['title']}\n{item['description']}"
        )
        country, city = parse_country_city(str(item.get("location", "")))
        remote_mode = str(
            item.get("remote_mode")
            or infer_remote_mode(str(item.get("location", "")), str(item["title"]), str(item["description"]))
        )
        values = {
            "source": str(item["source"])[:64],
            "external_id": str(item["external_id"])[:255],
            "title": str(item["title"])[:255],
            "company": str(item["company"])[:255],
            "location": str(item.get("location") or "Remote")[:255],
            "country": country[:128],
            "city": city[:128],
            "remote_mode": remote_mode[:32],
            "contract_type": str(item.get("contract_type") or "Full-time")[:64],
            "experience_level": str(item.get("experience_level") or "mid")[:32],
            "salary_text": str(item.get("salary_text") or "")[:128],
            "skills": list(skills),
            "description": str(item["description"]),
            "apply_url": str(item.get("apply_url") or "")[:1024],
            "posted_at": item["posted_at"],
        }

        if dialect == "postgresql":
            stmt = pg_insert(Job).values(**values).on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_={k: v for k, v in values.items() if k not in {"source", "external_id"}},
            )
            await db.execute(stmt)
        else:
            existing = await db.scalar(
                select(Job).where(
                    Job.source == values["source"],
                    Job.external_id == values["external_id"],
                )
            )
            if existing is None:
                db.add(Job(**values))
            else:
                for k, v in values.items():
                    setattr(existing, k, v)
        count += 1
    await db.flush()
    return count


async def _fetch_remoteok(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    resp = await client.get("https://remoteok.com/api")
    resp.raise_for_status()
    rows: list[dict[str, Any]] = []
    for item in resp.json():
        if not isinstance(item, dict) or "id" not in item:
            continue
        rows.append(
            {
                "source": "remoteok",
                "external_id": str(item["id"]),
                "title": str(item.get("position") or item.get("role") or "Untitled Role"),
                "company": str(item.get("company") or "Unknown"),
                "location": str(item.get("location") or "Remote"),
                "description": clean_html_text(str(item.get("description") or "")),
                "apply_url": str(item.get("apply_url") or item.get("url") or "https://remoteok.com"),
                "posted_at": _parse_iso_dt(item.get("date")),
                "skills": [str(t) for t in (item.get("tags") or []) if str(t).strip()][:8],
            }
        )
    return rows


async def _fetch_arbeitnow(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    resp = await client.get("https://www.arbeitnow.com/api/job-board-api")
    resp.raise_for_status()
    rows: list[dict[str, Any]] = []
    for item in resp.json().get("data", []):
        rows.append(
            {
                "source": "arbeitnow",
                "external_id": str(item.get("slug") or item.get("url") or ""),
                "title": str(item.get("title") or "Untitled Role"),
                "company": str(item.get("company_name") or "Unknown"),
                "location": str(item.get("location") or ("Remote" if item.get("remote") else "Europe")),
                "remote_mode": "remote" if item.get("remote") else "hybrid",
                "description": clean_html_text(str(item.get("description") or "")),
                "apply_url": str(item.get("url") or ""),
                "posted_at": _parse_iso_dt(item.get("created_at")),
                "skills": [str(t) for t in (item.get("tags") or []) if str(t).strip()][:8],
            }
        )
    return rows


async def _fetch_remotive(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    params = {"search": query} if query.strip() else {"category": "software-dev"}
    resp = await client.get("https://remotive.com/api/remote-jobs", params=params)
    resp.raise_for_status()
    rows: list[dict[str, Any]] = []
    for item in resp.json().get("jobs", [])[:50]:
        rows.append(
            {
                "source": "remotive",
                "external_id": str(item.get("id") or ""),
                "title": str(item.get("title") or "Untitled Role"),
                "company": str(item.get("company_name") or "Unknown"),
                "location": str(item.get("candidate_required_location") or "Worldwide"),
                "remote_mode": "remote",
                "salary_text": str(item.get("salary") or ""),
                "description": clean_html_text(str(item.get("description") or "")),
                "apply_url": str(item.get("url") or ""),
                "posted_at": _parse_iso_dt(item.get("publication_date")),
                "skills": [str(t) for t in (item.get("tags") or []) if str(t).strip()][:8],
            }
        )
    return rows


async def _fetch_weworkremotely(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    resp = await client.get("https://weworkremotely.com/remote-jobs.rss")
    resp.raise_for_status()
    root = ElementTree.fromstring(resp.text)
    rows: list[dict[str, Any]] = []
    for item in root.findall(".//item")[:50]:
        title = item.findtext("title", default="Untitled Role")
        link = item.findtext("link", default="https://weworkremotely.com")
        guid = item.findtext("guid", default=link)
        desc = clean_html_text(item.findtext("description", default=title))
        company = title.split(":")[0].strip() if ":" in title else "WeWorkRemotely"
        rows.append(
            {
                "source": "weworkremotely",
                "external_id": guid or link,
                "title": title,
                "company": company,
                "location": "Remote",
                "remote_mode": "remote",
                "description": desc,
                "apply_url": link,
                "posted_at": datetime.now(tz=timezone.utc),
            }
        )
    return rows


async def ingest_sources(
    db: AsyncSession,
    sources: list[str],
    query: str = "",
    hours_old: int = 720,
) -> int:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours_old)
    total_ingested = 0

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for src in sources:
            started = time.monotonic()
            fetched: list[dict[str, Any]] = []
            status_str = "success"
            err_msg = ""
            try:
                if src == "remoteok":
                    fetched = await _fetch_remoteok(client)
                elif src == "arbeitnow":
                    fetched = await _fetch_arbeitnow(client)
                elif src == "remotive":
                    fetched = await _fetch_remotive(client, query=query)
                elif src == "weworkremotely":
                    fetched = await _fetch_weworkremotely(client)
                else:
                    status_str = "skipped"
                filtered = [
                    r
                    for r in fetched
                    if r["posted_at"] >= cutoff
                    and (
                        not query.strip()
                        or query.strip().lower() in f"{r['title']} {r['description']}".lower()
                    )
                ]
                upserted = await upsert_jobs(db, filtered)
                total_ingested += upserted
            except Exception as exc:
                upserted = 0
                status_str = "failed"
                err_msg = str(exc)[:300]

            db.add(
                ScrapeRun(
                    source=src,
                    backend="api-async",
                    status=status_str,
                    jobs_fetched=len(fetched),
                    jobs_upserted=upserted,
                    duration_ms=int((time.monotonic() - started) * 1000),
                    error_message=err_msg,
                )
            )
    await db.commit()
    return total_ingested
