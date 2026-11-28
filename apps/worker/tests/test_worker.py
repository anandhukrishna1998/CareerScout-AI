import asyncio
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

from app.adapters.greenhouse import GreenhouseAdapter  # noqa: E402
from app.adapters.weworkremotely import WeWorkRemotelyAdapter  # noqa: E402
from app.main import (  # noqa: E402
    _parse_posted_at,
    dispatch_daily_digests,
    process_task,
    recompute_all_user_matches,
)
from app.scrape_orchestrator import scrape_all_sources  # noqa: E402


class WorkerTests(unittest.TestCase):
    def test_greenhouse_adapter_fetches_content_and_strips_html(self) -> None:
        os.environ["GREENHOUSE_COMPANIES"] = "acme"
        os.environ["SCRAPE_HOURS_OLD"] = "48"
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        sample_payload = {
            "jobs": [
                {
                    "id": 101,
                    "title": "ML Engineer",
                    "location": {"name": "Paris, France"},
                    "updated_at": now_iso,
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/101",
                    "content": "<p>Build <strong>Python</strong> &amp; RAG systems.</p>",
                }
            ]
        }

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertIn("content=true", str(request.url))
            return httpx.Response(200, json=sample_payload)

        transport = httpx.MockTransport(handler)
        orig_client = httpx.AsyncClient

        class PatchedClient(orig_client):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = transport
                super().__init__(*args, **kwargs)

        with patch("app.adapters.greenhouse.httpx.AsyncClient", PatchedClient):
            jobs = asyncio.run(GreenhouseAdapter().search_recent_jobs())

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0].description, "Build Python & RAG systems.")

    def test_weworkremotely_parses_description(self) -> None:
        os.environ["SCRAPE_HOURS_OLD"] = "720"
        rss = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><item>
          <guid>wwr-1</guid>
          <title>Acme: Senior Python Engineer</title>
          <link>https://weworkremotely.com/jobs/1</link>
          <description>&lt;p&gt;FastAPI &amp; PostgreSQL role.&lt;/p&gt;</description>
        </item></channel></rss>"""

        transport = httpx.MockTransport(lambda _req: httpx.Response(200, text=rss))
        orig_client = httpx.AsyncClient

        class PatchedClient(orig_client):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = transport
                super().__init__(*args, **kwargs)

        with patch("app.adapters.weworkremotely.httpx.AsyncClient", PatchedClient):
            jobs = asyncio.run(WeWorkRemotelyAdapter().search_recent_jobs())

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0].company, "Acme")
        self.assertEqual(jobs[0].description, "FastAPI & PostgreSQL role.")

    def test_orchestrator_isolates_failing_source(self) -> None:
        async def fake_httpx(source: str):
            if source == "remoteok":
                raise RuntimeError("upstream timeout")
            return []

        with patch("app.scrape_orchestrator.scrape_with_httpx", side_effect=fake_httpx):
            res = asyncio.run(scrape_all_sources(sources=["remoteok", "weworkremotely"]))
        self.assertIn("remoteok", res)
        self.assertEqual(res["remoteok"], [])

    def test_process_task_dispatches_match_and_digest_handlers(self) -> None:
        class _FakeConn:
            def __init__(self) -> None:
                self.exec_calls: list[str] = []

            async def fetch(self, query: str, *args):
                if "FROM users" in query:
                    return [
                        {
                            "id": 1,
                            "summary": "Python FastAPI engineer",
                            "skills": ["Python", "FastAPI"],
                            "languages": ["English"],
                            "years_experience": 4,
                        }
                    ]
                if "FROM jobs" in query:
                    return [
                        {
                            "id": 10,
                            "title": "Senior Python Engineer",
                            "description": "Python FastAPI Docker",
                            "location": "Paris",
                        }
                    ]
                if "FROM email_settings" in query:
                    return [
                        {
                            "user_id": 1,
                            "recipient_email": "ada@example.com",
                            "subject_template": "Daily Matches",
                            "min_match_score": 60,
                            "max_jobs_per_email": 5,
                            "full_name": "Ada",
                            "email": "ada@example.com",
                        }
                    ]
                if "FROM job_matches" in query:
                    return [
                        {
                            "title": "Senior Python Engineer",
                            "company": "Mistral",
                            "location": "Paris",
                            "score": 88,
                        }
                    ]
                return []

            async def execute(self, query: str, *args) -> None:
                self.exec_calls.append(query.strip().split()[0])

            async def close(self) -> None:
                pass

        fake_conn = _FakeConn()
        with patch("app.main.asyncpg.connect", AsyncMock(return_value=fake_conn)):
            updated = asyncio.run(
                process_task({"type": "match.recompute"}, "postgresql://x", "http://127.0.0.1:9")
            )
            digests = asyncio.run(
                process_task({"type": "email.daily_digest"}, "postgresql://x", "http://127.0.0.1:9")
            )

        self.assertEqual(updated, 1)
        self.assertEqual(digests, 1)
        self.assertIn("INSERT", fake_conn.exec_calls)
        self.assertIn("UPDATE", fake_conn.exec_calls)

    def test_parse_posted_at_returns_utc_datetime_from_date_str(self) -> None:
        dt = _parse_posted_at("2026-11-25")
        self.assertIsInstance(dt, datetime)
        self.assertEqual((dt.year, dt.month, dt.day), (2026, 11, 25))
        self.assertIsNotNone(dt.tzinfo)

    def test_geo_filters_non_europe_and_validates_slugs(self) -> None:
        from app.geo import is_europe_job, parse_europe_country_city, sanitize_company_slug

        self.assertTrue(is_europe_job("Lyon, France"))
        self.assertTrue(is_europe_job("London, UK"))
        self.assertFalse(is_europe_job("San Francisco, CA"))
        self.assertFalse(is_europe_job("Newark, NJ"))
        self.assertFalse(is_europe_job("Worldwide"))
        self.assertEqual(parse_europe_country_city("Télétravail - France"), ("France", "Remote"))
        self.assertEqual(sanitize_company_slug("alan"), "alan")
        self.assertIsNone(sanitize_company_slug("../bad/slug"))

    def test_ssrf_and_apply_url_sanitization(self) -> None:
        from app.geo import is_safe_outbound_https_url, sanitize_http_url

        self.assertTrue(is_safe_outbound_https_url("https://boards-api.greenhouse.io/v1/boards/algolia/jobs"))
        self.assertFalse(is_safe_outbound_https_url("http://boards-api.greenhouse.io/jobs"))
        self.assertFalse(is_safe_outbound_https_url("https://127.0.0.1/admin"))
        self.assertFalse(is_safe_outbound_https_url("https://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_outbound_https_url("https://localhost/secret"))

        self.assertEqual(sanitize_http_url("javascript:alert(1)"), "")
        self.assertEqual(sanitize_http_url("data:text/html,hi"), "")
        self.assertEqual(sanitize_http_url("https://jobs.alan.com/role"), "https://jobs.alan.com/role")


if __name__ == "__main__":
    unittest.main()
