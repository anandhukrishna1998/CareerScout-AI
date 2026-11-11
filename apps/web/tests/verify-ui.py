"""End-to-end dual-theme & cross-viewport Playwright QA suite for CareerScout AI."""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import (
    Browser,
    ConsoleMessage,
    Page,
    Route,
    sync_playwright,
)
from playwright.sync_api import (
    Error as PlaywrightError,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
WEB_ROOT = REPO_ROOT / "apps" / "web"

LIGHT_BG_RGB = "rgb(243, 241, 236)"
DARK_BG_RGB = "rgb(17, 22, 19)"

ROUTES: tuple[tuple[str, str], ...] = (
    ("/", "Discover the best AI & Data jobs"),
    ("/auth/login", "Welcome back"),
    ("/auth/register", "Create your account"),
    ("/onboarding", "Onboarding Wizard"),
    ("/dashboard", "Welcome back"),
    ("/jobs", "Role Explorer"),
    ("/jobs/1", "Senior AI & LLM Engineer"),
    ("/saved-jobs", "Saved Jobs & Tracker"),
    ("/cvs", "CV Manager"),
    ("/ai-insights", "AI Insights"),
    ("/ai-chat", "AI Chat Assistant"),
    ("/analytics", "Analytics Dashboard"),
    ("/email-settings", "Email Settings"),
    ("/profile-settings", "Profile Settings"),
    ("/admin", "Admin Operations"),
)

VIEWPORTS: tuple[tuple[str, int, int], ...] = (
    ("desktop-1440", 1440, 900),
    ("laptop-1024", 1024, 900),
    ("tablet-768", 768, 1024),
    ("mobile-390", 390, 844),
)

SCREENSHOT_ROUTES: dict[str, str] = {
    "/": "home",
    "/dashboard": "dashboard",
    "/jobs": "jobs",
    "/jobs/1": "job-detail",
    "/saved-jobs": "saved-jobs",
    "/cvs": "cvs",
    "/ai-insights": "ai-insights",
    "/email-settings": "email-settings",
    "/admin": "admin",
}

DEMO_USER = {
    "id": 1,
    "email": "ada@careerscout.ai",
    "full_name": "Ada Lovelace",
    "role": "admin",
    "onboarding_completed": False,
}

DEMO_TOKEN_PAIR = {
    "access_token": "mock-access-token-nordic",
    "refresh_token": "mock-refresh-token-nordic",
    "token_type": "bearer",
    "user": DEMO_USER,
}

EMAIL_PREVIEW_HTML = """
<div style="font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;background:#F3F1EC;color:#1B201C;border:1px solid #E2DFD6;padding:28px;border-radius:20px;max-width:640px;margin:0 auto;">
  <p style="color:#2D6A4F;font-size:12px;font-weight:600;letter-spacing:0.04em;margin:0 0 8px;">CareerScout AI Daily Digest</p>
  <h1 style="font-size:22px;font-weight:600;color:#1B201C;line-height:1.25;margin:0 0 8px;">Top AI &amp; Data jobs matching your profile today</h1>
  <p style="color:#3F4741;font-size:14px;line-height:1.5;margin:0 0 20px;">Hi Ada Lovelace, here are your top 2 ATS-ranked opportunities:</p>
  <div style="border:1px solid #E2DFD6;border-radius:16px;padding:18px;margin-bottom:12px;background:#FCFBF8;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <strong style="font-size:16px;font-weight:600;color:#1B201C;">Senior AI &amp; LLM Engineer</strong>
      <span style="background:#2D6A4F;color:#FFFFFF;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">91/100</span>
    </div>
    <p style="margin:6px 0 6px;color:#3F4741;font-size:14px;">Mistral Studio &middot; Paris, France</p>
    <p style="margin:4px 0;color:#59615B;font-size:13px;">Matched: Python, FastAPI, LLM, RAG</p>
    <p style="margin:4px 0 12px;color:#59615B;font-size:13px;">Missing: Kubernetes</p>
    <a href="https://example.com/jobs/1" style="color:#2D6A4F;font-size:13px;font-weight:600;text-decoration:none;">Apply on company site</a>
  </div>
</div>
""".strip()


@dataclass
class MockApiState:
    error_prefixes: set[str] = field(default_factory=set)
    saved_ids: set[int] = field(default_factory=lambda: {1})


def build_jobs_fixture() -> list[dict[str, object]]:
    return [
        {
            "id": 1,
            "title": "Senior AI & LLM Engineer",
            "company": "Mistral Studio",
            "location": "Paris, France",
            "country": "France",
            "city": "Paris",
            "remote_mode": "hybrid",
            "contract_type": "CDI",
            "experience_level": "senior",
            "salary_text": "75k-95k EUR",
            "skills": ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL", "Docker"],
            "source": "greenhouse",
            "apply_url": "https://example.com/jobs/1",
            "posted_at": "2026-11-11T09:00:00Z",
            "score": 91,
            "matched_skills": ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL"],
            "missing_skills": ["Kubernetes"],
            "is_saved": True,
            "saved_status": "saved",
        },
        {
            "id": 2,
            "title": "Applied Machine Learning Engineer",
            "company": "Kyutai Labs",
            "location": "Paris, France",
            "country": "France",
            "city": "Paris",
            "remote_mode": "remote",
            "contract_type": "Full-time",
            "experience_level": "mid",
            "salary_text": "70k-88k EUR",
            "skills": ["Python", "PyTorch", "Docker", "AWS", "Airflow"],
            "source": "remoteok",
            "apply_url": "https://example.com/jobs/2",
            "posted_at": "2026-11-10T16:30:00Z",
            "score": 84,
            "matched_skills": ["Python", "PyTorch", "Docker"],
            "missing_skills": ["AWS"],
            "is_saved": False,
            "saved_status": None,
        },
        {
            "id": 3,
            "title": "Data & Retrieval Platform Engineer",
            "company": "Nordic Health AI",
            "location": "Berlin, Germany",
            "country": "Germany",
            "city": "Berlin",
            "remote_mode": "hybrid",
            "contract_type": "Full-time",
            "experience_level": "mid",
            "salary_text": "68k-82k EUR",
            "skills": ["Python", "SQL", "dbt", "Kubernetes", "Spark"],
            "source": "arbeitnow",
            "apply_url": "https://example.com/jobs/3",
            "posted_at": "2026-11-09T11:00:00Z",
            "score": 72,
            "matched_skills": ["Python", "SQL"],
            "missing_skills": ["Kubernetes", "dbt"],
            "is_saved": False,
            "saved_status": None,
        },
        {
            "id": 4,
            "title": "MLOps Infrastructure Specialist",
            "company": "Fjord Systems",
            "location": "Worldwide",
            "country": "Worldwide",
            "city": "Remote",
            "remote_mode": "remote",
            "contract_type": "Contract",
            "experience_level": "senior",
            "salary_text": "80k-100k EUR",
            "skills": ["Kubernetes", "Terraform", "Go", "Python", "AWS"],
            "source": "remotive",
            "apply_url": "https://example.com/jobs/4",
            "posted_at": "2026-11-08T14:15:00Z",
            "score": 58,
            "matched_skills": ["Python"],
            "missing_skills": ["Kubernetes", "Terraform", "AWS"],
            "is_saved": False,
            "saved_status": None,
        },
    ]


def build_daily_matches(state: MockApiState) -> list[dict[str, object]]:
    jobs = build_jobs_fixture()
    recommendations = [
        "Strong overlap across Python, FastAPI, LLM orchestration, and RAG pipelines.",
        "Solid PyTorch and production Python alignment; highlight cloud inference experience.",
        "Good SQL and Python base; emphasize distributed ETL orchestration experience.",
        "Developing fit due to Kubernetes and Terraform infrastructure emphasis.",
    ]
    matches: list[dict[str, object]] = []
    for idx, job in enumerate(jobs):
        job_id = int(job["id"])  # type: ignore[arg-type]
        score = int(job["score"])  # type: ignore[arg-type]
        matches.append(
            {
                "job_id": job_id,
                "title": job["title"],
                "company": job["company"],
                "location": job["location"],
                "country": job["country"],
                "city": job["city"],
                "remote_mode": job["remote_mode"],
                "source": job["source"],
                "apply_url": job["apply_url"],
                "posted_at": job["posted_at"],
                "salary_text": job["salary_text"],
                "is_saved": job_id in state.saved_ids,
                "score": score,
                "skill_score": min(60, max(28, round(score * 0.6))),
                "semantic_score": min(25, max(12, round(score * 0.26))),
                "experience_score": min(15, max(8, round(score * 0.14))),
                "matched_skills": job["matched_skills"],
                "strengths": job["matched_skills"],
                "missing_skills": job["missing_skills"],
                "action_items": [
                    "Quantify production RAG latency and evaluation benchmarks on your primary CV.",
                    "Mention Kubernetes deployment workflows or container orchestration exposure.",
                ],
                "recommendation": recommendations[idx],
            }
        )
    return matches


def build_cvs_fixture() -> list[dict[str, object]]:
    return [
        {
            "id": 10,
            "filename": "ada-lovelace-ai-systems-cv.pdf",
            "mime_type": "application/pdf",
            "file_size": 148200,
            "is_primary": True,
            "encrypted": True,
            "created_at": "2026-11-10T10:00:00Z",
            "parsed": {
                "summary": (
                    "Senior AI & Python engineer specializing in LLM retrieval pipelines, "
                    "FastAPI services, and hybrid search evaluation."
                ),
                "skills": ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL", "Docker"],
                "languages": ["English", "French"],
                "years_experience": 5,
                "experience_level": "senior",
                "suggested_roles": ["Senior AI & LLM Engineer", "ML Engineer"],
            },
        },
        {
            "id": 11,
            "filename": "ada-lovelace-backend-cv.txt",
            "mime_type": "text/plain",
            "file_size": 24600,
            "is_primary": False,
            "encrypted": True,
            "created_at": "2026-11-05T08:30:00Z",
            "parsed": {
                "summary": "Backend engineer experienced in async Python APIs and PostgreSQL.",
                "skills": ["Python", "FastAPI", "PostgreSQL", "SQL"],
                "languages": ["English"],
                "years_experience": 5,
                "experience_level": "senior",
                "suggested_roles": ["Backend Python Engineer"],
            },
        },
    ]


def build_profile_fixture() -> dict[str, object]:
    return {
        "user_id": 1,
        "email": "ada@careerscout.ai",
        "full_name": "Ada Lovelace",
        "role": "admin",
        "headline": "Senior AI & Python Engineer",
        "country": "France",
        "preferred_countries": ["France", "Germany", "Worldwide"],
        "cities": ["Paris", "Lyon"],
        "experience_level": "senior",
        "years_experience": 5,
        "preferred_roles": ["AI Engineer", "Machine Learning Engineer"],
        "technologies": ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL", "Docker"],
        "languages": ["English", "French"],
        "salary_expectation": "75k-95k EUR",
        "salary_min": 75000,
        "salary_max": 95000,
        "salary_currency": "EUR",
        "visa_required": False,
        "remote_preference": "hybrid",
        "onboarding_completed": False,
        "updated_at": "2026-11-11T08:00:00Z",
    }


def make_api_handler(state: MockApiState):
    def handle_route(route: Route) -> None:
        req = route.request
        parsed = urlsplit(req.url)
        path = parsed.path
        if path.startswith("/api"):
            path = path[4:] or "/"
        query = parse_qs(parsed.query)
        method = req.method.upper()

        for prefix in state.error_prefixes:
            if path.startswith(prefix):
                route.fulfill(
                    status=500,
                    content_type="application/json",
                    body=json.dumps({"detail": f"Simulated 500 error for {path}"}),
                )
                return

        def ok(payload: object, status: int = 200) -> None:
            route.fulfill(
                status=status,
                content_type="application/json",
                body=json.dumps(payload),
            )

        if path in {"/auth/demo", "/auth/login", "/auth/register", "/auth/refresh"}:
            ok(DEMO_TOKEN_PAIR)
            return
        if path == "/auth/me":
            ok(DEMO_USER)
            return
        if path in {"/auth/logout", "/auth/change-password"}:
            ok({"ok": True})
            return

        if path.startswith("/matches/daily"):
            ok(build_daily_matches(state))
            return

        if path == "/matches/insights":
            ok(
                {
                    "ats_readiness_score": 84,
                    "jobs_analyzed": 48,
                    "cv_skills_count": 14,
                    "top_missing_skills": [
                        {"skill": "Kubernetes", "demand_count": 26, "impact": 12},
                        {"skill": "AWS", "demand_count": 19, "impact": 8},
                        {"skill": "dbt", "demand_count": 11, "impact": 5},
                    ],
                    "top_strengths": [
                        {"skill": "Python", "matched_count": 44},
                        {"skill": "FastAPI", "matched_count": 29},
                        {"skill": "LLM", "matched_count": 24},
                        {"skill": "RAG", "matched_count": 21},
                    ],
                    "market_skill_demand": [
                        {"skill": "Python", "demand_count": 44, "in_cv": True},
                        {"skill": "FastAPI", "demand_count": 29, "in_cv": True},
                        {"skill": "Kubernetes", "demand_count": 26, "in_cv": False},
                        {"skill": "LLM", "demand_count": 24, "in_cv": True},
                        {"skill": "AWS", "demand_count": 19, "in_cv": False},
                    ],
                    "recommendations": [
                        "Add quantified RAG retrieval evaluation metrics to your top summary.",
                        "Highlight container orchestration or Kubernetes basics for senior tracks.",
                    ],
                }
            )
            return

        if path == "/cvs":
            ok({"items": build_cvs_fixture()})
            return
        if path in {"/cvs/upload", "/cvs/from-text"} or path.startswith("/cvs/"):
            cvs = build_cvs_fixture()
            if method == "DELETE":
                ok({"ok": True})
                return
            ok(cvs[0])
            return

        if path == "/jobs":
            jobs = build_jobs_fixture()
            for j in jobs:
                j["is_saved"] = int(j["id"]) in state.saved_ids  # type: ignore[arg-type]
            page_num = int(query.get("page", ["1"])[0] or "1")
            q_filter = (query.get("q", [""])[0] or "").strip().lower()
            if q_filter:
                jobs = [
                    j
                    for j in jobs
                    if q_filter in str(j["title"]).lower()
                    or q_filter in str(j["company"]).lower()
                    or any(q_filter in str(s).lower() for s in j["skills"])  # type: ignore[attr-defined]
                ]
            ok(
                {
                    "items": jobs,
                    "total": len(jobs) if q_filter else 24,
                    "page": page_num,
                    "page_size": 12,
                    "total_pages": 1 if q_filter else 2,
                    "available_sources": ["greenhouse", "remoteok", "arbeitnow", "remotive"],
                    "available_countries": ["France", "Germany", "Worldwide"],
                }
            )
            return

        if path == "/jobs/ingest":
            ok({"total_ingested": 12, "query_used": "AI"})
            return

        if path.startswith("/jobs/"):
            jobs = build_jobs_fixture()
            job = jobs[0]
            job_id = int(job["id"])  # type: ignore[arg-type]
            ok(
                {
                    **job,
                    "is_saved": job_id in state.saved_ids,
                    "description": (
                        "Mistral Studio is looking for a Senior AI & LLM Engineer to architect "
                        "low-latency retrieval augmented generation pipelines, evaluation suites, "
                        "and Python/FastAPI inference APIs.\n\n"
                        "You will partner with product researchers to benchmark prompt quality, "
                        "optimize PostgreSQL pgvector indexing, and ship reliable developer tools."
                    ),
                    "match": {
                        "score": 91,
                        "skill_score": 54,
                        "semantic_score": 23,
                        "experience_score": 14,
                        "matched_skills": ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL"],
                        "strengths": [
                            "5 years production Python & FastAPI service ownership",
                            "Hands-on RAG evaluation and vector indexing delivery",
                        ],
                        "missing_skills": ["Kubernetes"],
                        "action_items": [
                            "Reference pgvector latency gains in your application pitch.",
                            "Note Docker Compose or cluster deployment workflows.",
                        ],
                        "recommendation": (
                            "Strong Fit: aligns closely with core LLM & FastAPI requirements."
                        ),
                    },
                    "saved": (
                        {
                            "status": "saved",
                            "notes": "Strong LLM systems team in Paris.",
                            "applied_at": None,
                        }
                        if job_id in state.saved_ids
                        else None
                    ),
                }
            )
            return

        if path == "/saved-jobs":
            if method == "POST":
                try:
                    payload = json.loads(req.post_data or "{}")
                    if isinstance(payload.get("job_id"), int):
                        state.saved_ids.add(payload["job_id"])
                except json.JSONDecodeError:
                    pass
                ok({"status": "saved", "notes": "", "applied_at": None})
                return
            jobs = build_jobs_fixture()
            ok(
                {
                    "items": [
                        {
                            "id": 101,
                            "job_id": 1,
                            "status": "saved",
                            "notes": "Strong LLM systems team in Paris; prepare RAG benchmark.",
                            "applied_at": None,
                            "created_at": "2026-11-11T09:15:00Z",
                            "updated_at": "2026-11-11T09:15:00Z",
                            "job": {
                                "id": 1,
                                "title": jobs[0]["title"],
                                "company": jobs[0]["company"],
                                "location": jobs[0]["location"],
                                "country": jobs[0]["country"],
                                "city": jobs[0]["city"],
                                "remote_mode": jobs[0]["remote_mode"],
                                "source": jobs[0]["source"],
                                "apply_url": jobs[0]["apply_url"],
                                "salary_text": jobs[0]["salary_text"],
                                "posted_at": jobs[0]["posted_at"],
                                "score": jobs[0]["score"],
                            },
                        },
                        {
                            "id": 102,
                            "job_id": 2,
                            "status": "interviewing",
                            "notes": "Technical screen scheduled for Thursday.",
                            "applied_at": "2026-11-09T14:00:00Z",
                            "created_at": "2026-11-09T14:00:00Z",
                            "updated_at": "2026-11-10T12:00:00Z",
                            "job": {
                                "id": 2,
                                "title": jobs[1]["title"],
                                "company": jobs[1]["company"],
                                "location": jobs[1]["location"],
                                "country": jobs[1]["country"],
                                "city": jobs[1]["city"],
                                "remote_mode": jobs[1]["remote_mode"],
                                "source": jobs[1]["source"],
                                "apply_url": jobs[1]["apply_url"],
                                "salary_text": jobs[1]["salary_text"],
                                "posted_at": jobs[1]["posted_at"],
                                "score": jobs[1]["score"],
                            },
                        },
                    ]
                }
            )
            return

        if path.startswith("/saved-jobs/"):
            try:
                job_id = int(path.rsplit("/", 1)[-1])
            except ValueError:
                job_id = 1
            if method == "DELETE":
                state.saved_ids.discard(job_id)
                ok({"ok": True})
                return
            ok({"ok": True, "status": "applied"})
            return

        if path == "/ai/chat/history":
            if method == "DELETE":
                ok({"ok": True})
                return
            ok(
                {
                    "items": [
                        {
                            "id": 1,
                            "role": "user",
                            "content": "What should I emphasize for Senior AI & LLM Engineer?",
                            "job_id": 1,
                            "created_at": "2026-11-11T10:12:00Z",
                        },
                        {
                            "id": 2,
                            "role": "assistant",
                            "content": (
                                "Lead with your FastAPI and RAG pipeline throughput numbers, "
                                "and note container orchestration familiarity to close the "
                                "Kubernetes gap."
                            ),
                            "job_id": 1,
                            "created_at": "2026-11-11T10:12:05Z",
                        },
                    ]
                }
            )
            return

        if path == "/ai/chat":
            ok(
                {
                    "reply": "Focus on measurable retrieval precision and FastAPI latency.",
                    "message": {
                        "id": 3,
                        "role": "assistant",
                        "content": "Focus on measurable retrieval precision and FastAPI latency.",
                        "job_id": 1,
                        "created_at": "2026-11-11T10:15:00Z",
                    },
                }
            )
            return

        if path == "/ai/cover-letter":
            ok(
                {
                    "cover_letter": (
                        "Dear Mistral Studio team,\n\n"
                        "Over five years building Python and FastAPI inference services, "
                        "I have designed hybrid RAG evaluation harnesses aligned with this role."
                    )
                }
            )
            return

        if path == "/analytics/overview":
            ok(
                {
                    "kpis": {
                        "total_jobs": 48,
                        "jobs_last_24h": 9,
                        "average_match_score": 78,
                        "high_match_jobs": 14,
                        "saved_count": len(state.saved_ids) + 1,
                        "applied_count": 3,
                        "digests_sent": 6,
                    },
                    "score_distribution": [
                        {"bucket": "80-100", "count": 14},
                        {"bucket": "60-79", "count": 21},
                        {"bucket": "40-59", "count": 10},
                        {"bucket": "0-39", "count": 3},
                    ],
                    "jobs_by_source": [
                        {"source": "greenhouse", "count": 18},
                        {"source": "remoteok", "count": 14},
                        {"source": "arbeitnow", "count": 10},
                        {"source": "remotive", "count": 6},
                    ],
                    "jobs_by_remote_mode": [
                        {"mode": "remote", "count": 22},
                        {"mode": "hybrid", "count": 19},
                        {"mode": "onsite", "count": 7},
                    ],
                    "top_market_skills": [
                        {"skill": "Python", "count": 44, "matched": True},
                        {"skill": "FastAPI", "count": 29, "matched": True},
                        {"skill": "Kubernetes", "count": 26, "matched": False},
                        {"skill": "LLM", "count": 24, "matched": True},
                        {"skill": "AWS", "count": 19, "matched": False},
                    ],
                    "application_funnel": [
                        {"stage": "saved", "count": 6},
                        {"stage": "applied", "count": 3},
                        {"stage": "interviewing", "count": 2},
                        {"stage": "offer", "count": 1},
                        {"stage": "rejected", "count": 0},
                    ],
                }
            )
            return

        if path == "/email-settings":
            ok(
                {
                    "digest_enabled": True,
                    "frequency": "daily",
                    "send_hour": 8,
                    "timezone": "Europe/Paris",
                    "min_match_score": 70,
                    "max_jobs_per_email": 8,
                    "subject_template": "Top AI & Data jobs matching your profile today",
                    "recipient_email": "ada@careerscout.ai",
                    "last_sent_at": "2026-11-11T08:00:00Z",
                    "updated_at": "2026-11-11T08:00:00Z",
                }
            )
            return

        if path == "/email-settings/logs":
            ok(
                {
                    "items": [
                        {
                            "id": 1,
                            "recipient_email": "ada@careerscout.ai",
                            "subject": "Top AI & Data jobs matching your profile today",
                            "job_count": 5,
                            "status": "sent",
                            "provider": "resend",
                            "error_message": "",
                            "sent_at": "2026-11-11T08:00:00Z",
                        },
                        {
                            "id": 2,
                            "recipient_email": "ada@careerscout.ai",
                            "subject": "Top AI & Data jobs matching your profile today",
                            "job_count": 4,
                            "status": "simulated",
                            "provider": "local_preview",
                            "error_message": "",
                            "sent_at": "2026-11-10T08:00:00Z",
                        },
                    ]
                }
            )
            return

        if path == "/email-settings/preview":
            ok(
                {
                    "recipient_email": "ada@careerscout.ai",
                    "subject": "Top AI & Data jobs matching your profile today",
                    "job_count": 2,
                    "jobs": [],
                    "html": EMAIL_PREVIEW_HTML,
                }
            )
            return

        if path == "/email-settings/test-digest":
            ok(
                {
                    "status": "simulated",
                    "provider": "local_preview",
                    "job_count": 2,
                    "preview_html": EMAIL_PREVIEW_HTML,
                }
            )
            return

        if path == "/profile":
            ok(build_profile_fixture())
            return

        if path == "/profile/complete-onboarding":
            ok({**build_profile_fixture(), "onboarding_completed": True})
            return

        if path == "/admin/status":
            ok(
                {
                    "services": {
                        "api": {"status": "ok"},
                        "database": {"status": "ok", "dialect": "postgresql"},
                        "ai_engine": {"status": "ok", "llm_mode": "gemini + deterministic"},
                        "redis": {"status": "ok", "queue_depth": 0},
                    },
                    "metrics": {
                        "total_jobs": 48,
                        "total_users": 4,
                        "recent_failures": 1,
                    },
                    "sources": [
                        {
                            "id": "greenhouse",
                            "name": "Greenhouse Boards",
                            "type": "ATS Public API",
                            "requires_key": False,
                            "configured": True,
                        },
                        {
                            "id": "remoteok",
                            "name": "RemoteOK",
                            "type": "Public Feed",
                            "requires_key": False,
                            "configured": True,
                        },
                        {
                            "id": "francetravail",
                            "name": "France Travail",
                            "type": "OAuth2 API",
                            "requires_key": True,
                            "configured": False,
                        },
                    ],
                    "recent_runs": [
                        {
                            "id": 12,
                            "source": "greenhouse",
                            "backend": "worker-async",
                            "status": "success",
                            "jobs_fetched": 24,
                            "jobs_upserted": 18,
                            "duration_ms": 840,
                            "error_message": "",
                            "started_at": "2026-11-11T09:00:00Z",
                        },
                        {
                            "id": 11,
                            "source": "francetravail",
                            "backend": "worker-async",
                            "status": "failed",
                            "jobs_fetched": 0,
                            "jobs_upserted": 0,
                            "duration_ms": 310,
                            "error_message": "Missing OAuth client credentials in environment.",
                            "started_at": "2026-11-11T07:00:00Z",
                        },
                    ],
                }
            )
            return

        if path == "/admin/scrape":
            ok({"total_ingested": 18})
            return

        ok({})

    return handle_route


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def start_next_server(port: int) -> subprocess.Popen[str]:
    if is_port_open(port):
        raise RuntimeError(f"Port {port} is already in use; stop existing process first.")

    if os.name == "nt":
        next_bin = WEB_ROOT / "node_modules" / ".bin" / "next.cmd"
        cmd = [str(next_bin), "start", "-p", str(port)]
        proc = subprocess.Popen(
            cmd,
            cwd=str(WEB_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        next_bin = WEB_ROOT / "node_modules" / ".bin" / "next"
        cmd = [str(next_bin), "start", "-p", str(port)]
        proc = subprocess.Popen(
            cmd,
            cwd=str(WEB_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )

    deadline = time.monotonic() + 45.0
    url = f"http://127.0.0.1:{port}/"
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            output = proc.stdout.read() if proc.stdout else ""
            raise RuntimeError(f"next start exited early ({proc.returncode}):\n{output}")
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status == 200:
                    return proc
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.4)

    stop_next_server(proc)
    raise RuntimeError(f"Timed out waiting for next start on port {port}.")


def stop_next_server(proc: subprocess.Popen[str] | None) -> None:
    if proc is None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    if proc.stdout:
        proc.stdout.close()


def launch_browser(playwright) -> Browser:  # type: ignore[no-untyped-def]
    attempts = [
        {"headless": True},
        {"headless": True, "channel": "msedge"},
        {"headless": True, "channel": "chrome"},
    ]
    last_err: Exception | None = None
    for kwargs in attempts:
        try:
            return playwright.chromium.launch(**kwargs)
        except PlaywrightError as exc:
            last_err = exc
    raise RuntimeError(f"Could not launch Chromium/Edge/Chrome: {last_err}")


def wait_for_theme_applied(page: Page, theme: str) -> None:
    expected_rgb = LIGHT_BG_RGB if theme == "light" else DARK_BG_RGB
    page.wait_for_function(
        """([expectedClass, expectedRgb]) => {
            const root = document.documentElement;
            const bg = getComputedStyle(document.body).backgroundColor;
            return (
                root.classList.contains(expectedClass) &&
                root.style.colorScheme === expectedClass &&
                bg === expectedRgb
            );
        }""",
        arg=[theme, expected_rgb],
        timeout=5000,
    )


def wait_for_route_settled(page: Page, expected_text: str) -> None:
    page.locator("main").wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        """(text) => {
            const main = document.querySelector('main');
            if (!main) return false;
            if (main.querySelector('[aria-busy="true"]')) return false;
            return main.innerText.includes(text);
        }""",
        arg=expected_text,
        timeout=10000,
    )
    page.wait_for_timeout(240)


def assert_layout_integrity(page: Page, route: str, viewport_name: str, theme: str) -> None:
    metrics = page.evaluate(
        """() => {
            const docEl = document.documentElement;
            const scrollWidth = docEl.scrollWidth;
            const innerWidth = window.innerWidth;
            const header = document.querySelector('header');
            const headerIssues = [];
            if (header) {
                const headerRect = header.getBoundingClientRect();
                const bar = header.firstElementChild;
                if (bar && bar.scrollWidth > bar.clientWidth + 1) {
                    headerIssues.push(
                        `Header bar scrollWidth ${bar.scrollWidth} > clientWidth ${bar.clientWidth}`
                    );
                }
                const controls = Array.from(header.querySelectorAll('a, button'));
                for (const el of controls) {
                    const style = getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;
                    if (rect.right > headerRect.right + 1 || rect.left < headerRect.left - 1) {
                        headerIssues.push(
                            `Header item "${(el.innerText || el.getAttribute('aria-label') || '').trim()}" clipped (${Math.round(rect.left)}..${Math.round(rect.right)} vs ${Math.round(headerRect.left)}..${Math.round(headerRect.right)})`
                        );
                    }
                }
            }
            return { scrollWidth, innerWidth, headerIssues };
        }"""
    )
    if metrics["scrollWidth"] > metrics["innerWidth"]:
        raise AssertionError(
            f"[{theme} {viewport_name} {route}] Horizontal overflow: "
            f"scrollWidth={metrics['scrollWidth']} > innerWidth={metrics['innerWidth']}"
        )
    if metrics["headerIssues"]:
        raise AssertionError(
            f"[{theme} {viewport_name} {route}] Header layout issue(s): "
            f"{'; '.join(metrics['headerIssues'])}"
        )


def attach_error_listeners(
    page: Page,
    page_errors: list[str],
    console_errors: list[str],
    allow_http_500: list[bool],
) -> None:
    def on_page_error(exc: Exception) -> None:
        page_errors.append(f"{page.url}: {exc}")

    def on_console(msg: ConsoleMessage) -> None:
        if msg.type != "error":
            return
        text = msg.text
        if allow_http_500[0] and "status of 500" in text:
            return
        console_errors.append(f"{page.url}: {text}")

    page.on("pageerror", on_page_error)
    page.on("console", on_console)


def run_first_visit_and_theme_checks(
    browser: Browser,
    base_url: str,
    state: MockApiState,
    page_errors: list[str],
    console_errors: list[str],
    allow_http_500: list[bool],
) -> None:
    print("1/4 Verifying first-visit Light default, theme toggles, reload persistence & demo...")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.route("**/api/**", make_api_handler(state))
    page = ctx.new_page()
    attach_error_listeners(page, page_errors, console_errors, allow_http_500)

    page.goto(f"{base_url}/", wait_until="networkidle")
    wait_for_route_settled(page, "Discover the best AI & Data jobs")
    wait_for_theme_applied(page, "light")
    stored = page.evaluate("() => localStorage.getItem('careerscout-theme')")
    assert stored is None, f"Expected unset careerscout-theme on first visit, got {stored!r}"

    page.get_by_test_id("theme-toggle").click()
    wait_for_theme_applied(page, "dark")
    assert page.evaluate("() => localStorage.getItem('careerscout-theme')") == "dark", (
        "Expected careerscout-theme='dark' after desktop toggle"
    )

    page.reload(wait_until="networkidle")
    wait_for_theme_applied(page, "dark")

    page.get_by_test_id("theme-toggle").click()
    wait_for_theme_applied(page, "light")
    assert page.evaluate("() => localStorage.getItem('careerscout-theme')") == "light", (
        "Expected careerscout-theme='light' after toggle back"
    )

    page.get_by_role("button", name="View Live Demo").click()
    page.wait_for_url("**/dashboard", timeout=10000)
    wait_for_route_settled(page, "Today's Strongest Match")
    ctx.close()

    mobile_ctx = browser.new_context(viewport={"width": 390, "height": 844})
    mobile_ctx.route("**/api/**", make_api_handler(state))
    m_page = mobile_ctx.new_page()
    attach_error_listeners(m_page, page_errors, console_errors, allow_http_500)
    m_page.goto(f"{base_url}/", wait_until="networkidle")
    wait_for_theme_applied(m_page, "light")

    m_page.get_by_test_id("theme-toggle-mobile").click()
    wait_for_theme_applied(m_page, "dark")
    m_page.reload(wait_until="networkidle")
    wait_for_theme_applied(m_page, "dark")

    m_page.get_by_role("button", name="Toggle navigation menu").click()
    m_page.locator("#mobile-nav-drawer").wait_for(state="visible", timeout=5000)
    assert_layout_integrity(m_page, "/", "mobile-390-drawer", "dark")
    m_page.get_by_test_id("theme-toggle-mobile").click()
    wait_for_theme_applied(m_page, "light")
    mobile_ctx.close()


def run_route_matrix_checks(
    browser: Browser,
    base_url: str,
    state: MockApiState,
    screenshot_dir: Path,
    page_errors: list[str],
    console_errors: list[str],
    allow_http_500: list[bool],
) -> None:
    print("2/4 Auditing all 15 routes across Light & Dark modes and 4 viewports...")
    auth_storage = json.dumps(
        {
            "state": {
                "accessToken": DEMO_TOKEN_PAIR["access_token"],
                "refreshToken": DEMO_TOKEN_PAIR["refresh_token"],
                "user": DEMO_USER,
            },
            "version": 0,
        }
    )

    for theme in ("light", "dark"):
        for viewport_name, width, height in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": width, "height": height})
            ctx.add_init_script(
                f"""
                if (window === window.top) {{
                    try {{
                        localStorage.setItem('careerscout-theme', {json.dumps(theme)});
                        localStorage.setItem('careerscout-auth', {json.dumps(auth_storage)});
                    }} catch {{}}
                }}
                """
            )
            ctx.route("**/api/**", make_api_handler(state))
            page = ctx.new_page()
            attach_error_listeners(page, page_errors, console_errors, allow_http_500)

            for route, marker in ROUTES:
                page.goto(f"{base_url}{route}", wait_until="networkidle")
                wait_for_route_settled(page, marker)
                wait_for_theme_applied(page, theme)
                assert_layout_integrity(page, route, viewport_name, theme)

                if route in SCREENSHOT_ROUTES and viewport_name in {"desktop-1440", "mobile-390"}:
                    slug = SCREENSHOT_ROUTES[route]
                    shot_path = screenshot_dir / f"{theme}-{viewport_name}-{slug}.png"
                    if route == "/email-settings" and viewport_name == "mobile-390":
                        page.set_viewport_size({"width": width, "height": 1850})
                        page.wait_for_timeout(240)
                        page.screenshot(path=str(shot_path), full_page=True)
                        page.set_viewport_size({"width": width, "height": height})
                    else:
                        page.screenshot(path=str(shot_path), full_page=True)

            ctx.close()


def run_interactive_review_checks(
    browser: Browser,
    base_url: str,
    state: MockApiState,
    page_errors: list[str],
    console_errors: list[str],
    allow_http_500: list[bool],
) -> None:
    print("3/4 Running interactive Review Focus checks (a11y, mobile filters, iframe, 500s)...")
    auth_storage = json.dumps(
        {
            "state": {
                "accessToken": DEMO_TOKEN_PAIR["access_token"],
                "refreshToken": DEMO_TOKEN_PAIR["refresh_token"],
                "user": DEMO_USER,
            },
            "version": 0,
        }
    )

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(
        f"""
        if (window === window.top) {{
            try {{
                localStorage.setItem('careerscout-theme', 'light');
                localStorage.setItem('careerscout-auth', {json.dumps(auth_storage)});
            }} catch {{}}
        }}
        """
    )
    ctx.route("**/api/**", make_api_handler(state))
    page = ctx.new_page()
    attach_error_listeners(page, page_errors, console_errors, allow_http_500)

    # /cvs keyboard Tab reachability to visible Choose File button (never hidden input)
    page.goto(f"{base_url}/cvs", wait_until="networkidle")
    wait_for_route_settled(page, "CV Manager")
    page.get_by_role("button", name="Paste CV Text Instead").focus()
    reached_choose = False
    for _ in range(10):
        page.keyboard.press("Tab")
        active = page.evaluate(
            """() => {
                const el = document.activeElement;
                return {
                    tag: el ? el.tagName : '',
                    type: el ? el.getAttribute('type') : '',
                    text: el ? (el.textContent || '').trim() : '',
                };
            }"""
        )
        assert active["type"] != "file", "Hidden file input should never receive keyboard focus"
        if active["tag"] == "BUTTON" and "Choose File" in active["text"]:
            reached_choose = True
            break
    assert reached_choose, "Keyboard Tab navigation failed to reach the visible Choose File button"

    # /onboarding step button height >= 44px on desktop and mobile
    for vp_width, vp_height, vp_label in ((1440, 900, "desktop"), (390, 844, "mobile")):
        page.set_viewport_size({"width": vp_width, "height": vp_height})
        page.goto(f"{base_url}/onboarding", wait_until="networkidle")
        wait_for_route_settled(page, "Onboarding Wizard")
        step_buttons = page.locator('nav[aria-label="Onboarding steps"] button')
        assert step_buttons.count() == 3, f"Expected 3 onboarding steps, got {step_buttons.count()}"
        for idx in range(3):
            box = step_buttons.nth(idx).bounding_box()
            assert box is not None and box["height"] >= 44, (
                f"[{vp_label}] Onboarding step {idx + 1} height < 44px: {box}"
            )
    page.set_viewport_size({"width": 1440, "height": 900})

    # /email-settings iframe srcdoc check (no legacy #09090b or #7c3aed) & color-scheme matching
    page.goto(f"{base_url}/email-settings", wait_until="networkidle")
    wait_for_route_settled(page, "Email Settings")
    iframe = page.locator('iframe[title="Email digest preview"]')
    srcdoc = iframe.get_attribute("srcdoc") or ""
    assert "#F3F1EC" in srcdoc and "#FCFBF8" in srcdoc and "#2D6A4F" in srcdoc, (
        "Email preview srcdoc missing Option 3 botanical colors"
    )
    assert "#09090b" not in srcdoc.lower() and "#7c3aed" not in srcdoc.lower(), (
        "Email preview srcdoc still contains legacy dark/violet colors"
    )
    iframe_scheme = iframe.evaluate("el => getComputedStyle(el).colorScheme")
    assert iframe_scheme == "light", (
        f"Expected light colorScheme on preview iframe, got {iframe_scheme!r}"
    )

    # Mobile title-wrap regression guard on /cvs, /jobs/1, and /saved-jobs (390px)
    page.set_viewport_size({"width": 390, "height": 844})
    for route, marker, selector in (
        ("/cvs", "CV Manager", "main article h2"),
        ("/jobs/1", "Senior AI & LLM Engineer", "main h1"),
        ("/saved-jobs", "Saved Jobs & Tracker", "main article h2"),
    ):
        page.goto(f"{base_url}{route}", wait_until="networkidle")
        wait_for_route_settled(page, marker)
        box = page.locator(selector).first.bounding_box()
        assert box is not None and box["width"] >= 250, (
            f"[mobile-390 {route}] Title element crushed unexpectedly narrow: {box}"
        )

    # /jobs mobile collapsible FilterPanel
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{base_url}/jobs", wait_until="networkidle")
    wait_for_route_settled(page, "Role Explorer")
    filter_toggle = page.locator('aside[aria-label="Job filters"] button[aria-controls]')
    assert filter_toggle.get_attribute("aria-expanded") == "false", (
        "Mobile FilterPanel must start collapsed (aria-expanded='false')"
    )
    filter_toggle.click()
    assert filter_toggle.get_attribute("aria-expanded") == "true", (
        "Mobile FilterPanel should expand on toggle click"
    )
    assert page.get_by_label("Keyword / Role").is_visible(), "Filter keyword field should show"
    assert_layout_integrity(page, "/jobs", "mobile-390-filters-open", "light")
    page.set_viewport_size({"width": 1440, "height": 900})

    # Simulated 500 error + Retry recovery on /dashboard, /jobs, /email-settings
    for route, fail_prefix, marker, retry_expected_text in (
        ("/dashboard", "/matches/daily", "Welcome back", "Today's Strongest Match"),
        ("/jobs", "/jobs", "Role Explorer", "Senior AI & LLM Engineer"),
        ("/email-settings", "/email-settings", "Email Settings", "Enable Daily Job Digest"),
    ):
        allow_http_500[0] = True
        state.error_prefixes.add(fail_prefix)
        page.goto(f"{base_url}{route}", wait_until="networkidle")
        page.locator('main [role="alert"]').wait_for(state="visible", timeout=10000)
        alert_text = page.locator('main [role="alert"]').inner_text()
        assert "Retry" in alert_text, f"Expected Retry button inside role=alert on {route}"
        assert "Ready to rank your daily job feed" not in page.locator("main").inner_text(), (
            f"Fake empty state shown on {route} during 500 error"
        )

        state.error_prefixes.remove(fail_prefix)
        page.get_by_role("button", name="Retry").click()
        wait_for_route_settled(page, retry_expected_text)
        allow_http_500[0] = False
        assert marker in page.locator("main").inner_text()

    ctx.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="CareerScout UI Playwright QA")
    parser.add_argument("--port", type=int, default=3001)
    parser.add_argument(
        "--screenshot-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / "careerscout-verify-ui",
    )
    args = parser.parse_args()

    args.screenshot_dir.mkdir(parents=True, exist_ok=True)
    base_url = f"http://127.0.0.1:{args.port}"
    state = MockApiState()
    page_errors: list[str] = []
    console_errors: list[str] = []
    allow_http_500 = [False]

    server_proc: subprocess.Popen[str] | None = None
    try:
        print(f"Starting next start -p {args.port}...")
        server_proc = start_next_server(args.port)
        with sync_playwright() as playwright:
            browser = launch_browser(playwright)
            try:
                run_first_visit_and_theme_checks(
                    browser, base_url, state, page_errors, console_errors, allow_http_500
                )
                run_route_matrix_checks(
                    browser,
                    base_url,
                    state,
                    args.screenshot_dir,
                    page_errors,
                    console_errors,
                    allow_http_500,
                )
                run_interactive_review_checks(
                    browser, base_url, state, page_errors, console_errors, allow_http_500
                )
            finally:
                browser.close()
    finally:
        print("4/4 Stopping next start server...")
        stop_next_server(server_proc)

    if page_errors:
        print("Uncaught page errors detected:", file=sys.stderr)
        for err in page_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    if console_errors:
        print("Unexpected console errors detected:", file=sys.stderr)
        for err in console_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(
        f"PASS: All {len(ROUTES)} routes verified in Light & Dark modes across "
        f"{len(VIEWPORTS)} viewports. Screenshots saved to {args.screenshot_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
