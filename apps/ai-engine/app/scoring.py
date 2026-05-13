from pydantic import BaseModel


class MatchResult(BaseModel):
    score: int
    strengths: list[str]
    missing_skills: list[str]
    recommendation: str


SKILL_KEYWORDS = [
    "python",
    "java",
    "typescript",
    "javascript",
    "sql",
    "spark",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "llm",
    "pytorch",
    "tensorflow",
    "fastapi",
    "django",
    "react",
    "postgresql",
    "redis",
]


def extract_skills(text: str) -> list[str]:
    lower = text.lower()
    found = [skill for skill in SKILL_KEYWORDS if skill in lower]
    return sorted(set(found))


def compute_hybrid_score(cv_skills: list[str], job_text: str, years_experience: int = 0) -> MatchResult:
    job_skills = extract_skills(job_text)
    if not job_skills:
        return MatchResult(score=40, strengths=[], missing_skills=[], recommendation="Insufficient job detail")

    cv_set = set(s.lower() for s in cv_skills)
    job_set = set(job_skills)
    overlap = sorted(cv_set & job_set)
    missing = sorted(job_set - cv_set)

    skill_overlap_ratio = len(overlap) / max(len(job_set), 1)
    experience_bonus = min(years_experience / 10, 1) * 10
    score = int(min(100, round(skill_overlap_ratio * 85 + experience_bonus)))

    if score >= 85:
        recommendation = "Excellent match"
    elif score >= 70:
        recommendation = "Good match"
    elif score >= 50:
        recommendation = "Moderate match"
    else:
        recommendation = "Low match"

    strengths = [f"Strong match on {skill}" for skill in overlap[:4]]
    return MatchResult(score=score, strengths=strengths, missing_skills=missing[:8], recommendation=recommendation)
