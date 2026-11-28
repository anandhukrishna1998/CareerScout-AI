import math
import re
from typing import Any

import httpx

from app.settings import settings

_SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "LLM": ("llm", "llms"),
}

_SKILL_PATTERNS: tuple[tuple[str, tuple[re.Pattern[str], ...]], ...] = tuple(
    (
        label,
        tuple(
            re.compile(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])")
            for alias in _SKILL_ALIASES.get(label, (label.lower(),))
        ),
    )
    for label in (
        "Python",
        "Java",
        "TypeScript",
        "JavaScript",
        "Go",
        "Rust",
        "C++",
        "SQL",
        "NoSQL",
        "Spark",
        "Airflow",
        "dbt",
        "Kafka",
        "RabbitMQ",
        "AWS",
        "GCP",
        "Azure",
        "Docker",
        "Kubernetes",
        "Terraform",
        "Linux",
        "Git",
        "LLM",
        "RAG",
        "LangChain",
        "LangGraph",
        "Langfuse",
        "CrewAI",
        "Transformers",
        "Hugging Face",
        "Ollama",
        "BERT",
        "NLP",
        "MCP",
        "PyTorch",
        "TensorFlow",
        "Scikit-learn",
        "XGBoost",
        "Pandas",
        "NumPy",
        "SciPy",
        "Dask",
        "Matplotlib",
        "Seaborn",
        "Evidently",
        "MLOps",
        "FastAPI",
        "Flask",
        "Streamlit",
        "Django",
        "React",
        "Next.js",
        "PostgreSQL",
        "pgvector",
        "MongoDB",
        "Neo4j",
        "Firestore",
        "Redis",
        "Power BI",
        "CI/CD",
        "GitHub Actions",
    )
)


def extract_skills_local(text: str) -> list[str]:
    lower = text.lower()
    return [label for label, patterns in _SKILL_PATTERNS if any(pat.search(lower) for pat in patterns)]


def _extract_years_local(text: str) -> int:
    matches = re.findall(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?|ans)\b", text.lower())
    years = max((int(m) for m in matches), default=0)
    return min(years, 45)


def _infer_level(years: int) -> str:
    if years >= 7:
        return "lead"
    if years >= 4:
        return "senior"
    if years >= 2:
        return "mid"
    return "junior"


def parse_cv_local(text: str) -> dict[str, Any]:
    skills = extract_skills_local(text)
    years = _extract_years_local(text)
    languages = [
        lang.title()
        for lang in (
            "english",
            "french",
            "spanish",
            "german",
            "italian",
            "portuguese",
            "hindi",
            "malayalam",
            "tamil",
        )
        if re.search(rf"\b{lang}\b", text.lower())
    ]
    level = _infer_level(years)
    summary_skills = ", ".join(skills[:5]) if skills else "software engineering"
    return {
        "summary": f"{level.title()} profile with focus on {summary_skills}.",
        "skills": skills,
        "languages": languages or ["English"],
        "years_experience": years,
        "experience_level": level,
        "suggested_roles": (
            ["AI Engineer", "Machine Learning Engineer"]
            if any(s in skills for s in ("LLM", "RAG", "PyTorch", "TensorFlow"))
            else ["Backend Python Engineer", "Full-Stack Engineer"]
        ),
    }


def score_job_local(cv_profile: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    job_text = f"{job.get('title', '')}\n{job.get('description', '')}\n{job.get('location', '')}"
    job_skills = extract_skills_local(job_text)
    cv_skills = [str(s) for s in cv_profile.get("skills", [])]
    cv_lower = {s.lower(): s for s in cv_skills}
    job_lower = {s.lower(): s for s in job_skills}

    if not job_lower:
        return {
            "score": 48,
            "skill_score": 26,
            "semantic_score": 14,
            "experience_score": 8,
            "matched_skills": [],
            "strengths": ["Profile matches general role context"],
            "missing_skills": [],
            "action_items": ["Tailor your summary to mirror the role's key deliverables."],
            "recommendation": "Moderate fit — limited technical keywords detected in job description.",
        }

    matched = [job_lower[k] for k in sorted(set(cv_lower) & set(job_lower))]
    missing = [job_lower[k] for k in sorted(set(job_lower) - set(cv_lower))]

    overlap_ratio = len(matched) / max(len(job_lower), 1)
    effective_denom = max(len(job_lower), 3)
    skill_score = int(round((len(matched) / effective_denom) * 60))

    cv_tokens = set(re.findall(r"[a-z0-9]{3,}", str(cv_profile.get("summary", "")).lower()))
    job_tokens = set(re.findall(r"[a-z0-9]{3,}", job_text.lower()))
    if cv_tokens and job_tokens:
        cosine_proxy = len(cv_tokens & job_tokens) / math.sqrt(len(cv_tokens) * len(job_tokens))
    else:
        cosine_proxy = overlap_ratio * 0.6
    semantic_score = int(min(25, round(max(overlap_ratio * 18, cosine_proxy * 35))))

    years = int(cv_profile.get("years_experience") or 0)
    experience_score = int(min(15, max(5, round(min(years, 8) / 8 * 15))))
    total = int(min(100, skill_score + semantic_score + experience_score))

    if total >= 80:
        rec = "Strong Fit: aligns closely with core technical and seniority requirements."
    elif total >= 60:
        rec = "Good Fit: solid stack overlap with minor gaps you can address in your cover note."
    else:
        rec = "Developing Fit: build or highlight adjacent projects for the missing core skills."

    strengths = [f"Verified strength in {s}" for s in matched[:4]]
    action_items = [
        f"Quantify measurable impact using {matched[0]}" if matched else "Highlight core domain impact",
        f"Address {missing[0]} exposure in your summary or project bullets"
        if missing
        else "Lead with production metrics matching the role scope",
    ]
    return {
        "score": total,
        "skill_score": skill_score,
        "semantic_score": semantic_score,
        "experience_score": experience_score,
        "matched_skills": matched,
        "strengths": strengths,
        "missing_skills": missing[:8],
        "action_items": action_items,
        "recommendation": rec,
    }


async def parse_cv_text(text: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{settings.ai_engine_url}/cv/parse", json={"text": text})
            response.raise_for_status()
            return response.json()
    except Exception:
        return parse_cv_local(text)


async def score_job(cv_profile: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "cv_profile": cv_profile,
        "job": {
            "title": job["title"],
            "description": job["description"],
            "location": job.get("location", ""),
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{settings.ai_engine_url}/ats/score-job", json=payload)
            response.raise_for_status()
            return response.json()
    except Exception:
        return score_job_local(cv_profile, job)


async def score_jobs_batch(
    cv_profile: dict[str, Any], jobs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not jobs:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.ai_engine_url}/ats/score-batch",
                json={"cv_profile": cv_profile, "jobs": jobs},
            )
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and isinstance(data.get("results"), list):
                return data["results"]
    except Exception:
        pass
    return [score_job_local(cv_profile, j) for j in jobs]


async def generate_cover_letter(
    cv_profile: dict[str, Any], job: dict[str, Any], tone: str
) -> str:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.ai_engine_url}/ai/cover-letter",
                json={"cv_profile": cv_profile, "job": job, "tone": tone},
            )
            response.raise_for_status()
            text = str(response.json().get("cover_letter", "")).strip()
            if text and not text.startswith("[Gemini stub]"):
                return text
    except Exception:
        pass

    skills = ", ".join(cv_profile.get("skills", [])[:5]) or "Python and production systems"
    years = int(cv_profile.get("years_experience") or 3)
    opening = (
        f"I am excited to apply for the {job['title']} role at {job['company']}."
        if tone == "enthusiastic"
        else f"I am writing to express strong interest in the {job['title']} position at {job['company']}."
    )
    return (
        f"Dear {job['company']} hiring team,\n\n"
        f"{opening} With {years}+ years of hands-on experience across {skills}, "
        f"I have delivered reliable systems aligned with your team's goals.\n\n"
        f"I would welcome the opportunity to discuss how my background can contribute immediately.\n\n"
        f"Best regards"
    )


async def generate_chat_reply(
    message: str, cv_profile: dict[str, Any] | None, job: dict[str, Any] | None
) -> str:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.ai_engine_url}/ai/chat",
                json={"message": message, "cv_profile": cv_profile or {}, "job": job},
            )
            response.raise_for_status()
            reply = str(response.json().get("reply", "")).strip()
            if reply and not reply.startswith("[Gemini stub]"):
                return reply
    except Exception:
        pass

    skills = ", ".join((cv_profile or {}).get("skills", [])[:6]) or "your core stack"
    if job:
        scored = score_job_local(cv_profile or {}, job)
        gaps = ", ".join(scored.get("missing_skills", [])[:3]) or "none detected"
        return (
            f"For {job['title']} at {job['company']} (estimated fit {scored['score']}/100): "
            f"lead with your experience in {skills}. "
            f"Key gaps to address proactively: {gaps}. "
            f"Next step: {scored['action_items'][0] if scored['action_items'] else 'quantify production impact'}."
        )
    return (
        f"Based on your active profile ({skills}), prioritize quantifying latency/reliability metrics "
        f"in your top two CV bullets and highlighting cloud/deployment ownership for senior roles."
    )
