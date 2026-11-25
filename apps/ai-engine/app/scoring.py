import math
import re

from pydantic import BaseModel, Field


class MatchResult(BaseModel):
    score: int
    skill_score: int = 0
    semantic_score: int = 0
    experience_score: int = 0
    matched_skills: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    recommendation: str


SKILL_KEYWORDS = [
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
]

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
    for label in SKILL_KEYWORDS
)


def extract_skills(text: str) -> list[str]:
    lower = text.lower()
    return [label for label, patterns in _SKILL_PATTERNS if any(pat.search(lower) for pat in patterns)]


def extract_years_experience(text: str) -> int:
    matches = re.findall(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?|ans)\b", text.lower())
    return min(max((int(m) for m in matches), default=0), 45)


def compute_hybrid_score(
    cv_skills: list[str],
    job_text: str,
    years_experience: int = 0,
    cv_summary: str = "",
) -> MatchResult:
    job_skills = extract_skills(job_text)
    if not job_skills:
        return MatchResult(
            score=48,
            skill_score=26,
            semantic_score=14,
            experience_score=8,
            matched_skills=[],
            strengths=["Profile matches general role context"],
            missing_skills=[],
            action_items=["Mirror key domain deliverables in your CV summary."],
            recommendation="Insufficient job detail",
        )

    cv_map = {s.lower(): s for s in cv_skills}
    job_map = {s.lower(): s for s in job_skills}
    overlap = [job_map[k] for k in sorted(set(cv_map) & set(job_map))]
    missing = [job_map[k] for k in sorted(set(job_map) - set(cv_map))]

    skill_overlap_ratio = len(overlap) / max(len(job_map), 1)
    skill_score = int(round(skill_overlap_ratio * 60))

    cv_tokens = set(re.findall(r"[a-z0-9]{3,}", cv_summary.lower()))
    job_tokens = set(re.findall(r"[a-z0-9]{3,}", job_text.lower()))
    if cv_tokens and job_tokens:
        cosine_proxy = len(cv_tokens & job_tokens) / math.sqrt(len(cv_tokens) * len(job_tokens))
    else:
        cosine_proxy = skill_overlap_ratio * 0.6
    semantic_score = int(min(25, round(max(skill_overlap_ratio * 18, cosine_proxy * 35))))

    experience_score = int(min(15, max(5, round(min(years_experience, 8) / 8 * 15))))
    score = int(min(100, skill_score + semantic_score + experience_score))

    if score >= 85:
        recommendation = "Excellent match"
    elif score >= 70:
        recommendation = "Good match"
    elif score >= 50:
        recommendation = "Moderate match"
    else:
        recommendation = "Low match"

    strengths = [f"Strong match on {skill}" for skill in overlap[:4]]
    action_items = [
        f"Quantify production outcomes using {overlap[0]}"
        if overlap
        else "Highlight core domain impact",
        f"Address {missing[0]} exposure in your summary or project bullets"
        if missing
        else "Lead with concrete reliability and scale metrics",
    ]
    return MatchResult(
        score=score,
        skill_score=skill_score,
        semantic_score=semantic_score,
        experience_score=experience_score,
        matched_skills=overlap,
        strengths=strengths,
        missing_skills=missing[:8],
        action_items=action_items,
        recommendation=recommendation,
    )
