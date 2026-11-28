from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.providers.factory import get_provider
from app.scoring import (
    MatchResult,
    compute_hybrid_score,
    extract_skills,
    extract_years_experience,
)

app = FastAPI(title="CareerScout AI Engine", version="0.2.0")


class PromptRequest(BaseModel):
    prompt: str


class EmbedRequest(BaseModel):
    text: str


class CVParseRequest(BaseModel):
    text: str


class CVProfile(BaseModel):
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    years_experience: int = 0


class JobPayload(BaseModel):
    title: str
    description: str
    location: str = ""
    company: str = ""


class ATSScoreRequest(BaseModel):
    cv_profile: CVProfile
    job: JobPayload


class ATSBatchScoreRequest(BaseModel):
    cv_profile: CVProfile
    jobs: list[JobPayload]


class CoverLetterRequest(BaseModel):
    cv_profile: CVProfile
    job: JobPayload
    tone: str = "concise"


class ChatRequest(BaseModel):
    message: str
    cv_profile: CVProfile = Field(default_factory=CVProfile)
    job: JobPayload | None = None


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/llm/generate")
async def llm_generate(payload: PromptRequest) -> dict[str, str]:
    provider = get_provider()
    text = await provider.generate(payload.prompt)
    return {"text": text or "LLM response unavailable without provider API key."}


@app.post("/embeddings")
async def embeddings(payload: EmbedRequest) -> dict[str, object]:
    provider = get_provider()
    vector = await provider.embed(payload.text)
    return {"vector": vector, "dimensions": len(vector)}


@app.post("/cv/parse")
async def parse_cv(payload: CVParseRequest) -> dict[str, object]:
    text = payload.text.strip()
    skills = extract_skills(text)
    years = extract_years_experience(text)
    languages = [
        lang.title()
        for lang in [
            "english",
            "french",
            "spanish",
            "german",
            "italian",
            "portuguese",
            "hindi",
            "malayalam",
            "tamil",
        ]
        if lang in text.lower()
    ]
    level = "lead" if years >= 7 else "senior" if years >= 4 else "mid" if years >= 2 else "junior"
    summary_skills = ", ".join(skills[:5]) if skills else "software engineering"
    return {
        "summary": f"{level.title()} profile focused on {summary_skills}.",
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


@app.post("/ats/score-job", response_model=MatchResult)
async def ats_score_job(payload: ATSScoreRequest) -> MatchResult:
    job_text = f"{payload.job.title}\n{payload.job.description}\n{payload.job.location}"
    return compute_hybrid_score(
        cv_skills=payload.cv_profile.skills,
        job_text=job_text,
        years_experience=payload.cv_profile.years_experience,
        cv_summary=payload.cv_profile.summary,
    )


@app.post("/ats/score-batch")
async def ats_score_batch(payload: ATSBatchScoreRequest) -> dict[str, list[MatchResult]]:
    results = [
        compute_hybrid_score(
            cv_skills=payload.cv_profile.skills,
            job_text=f"{j.title}\n{j.description}\n{j.location}",
            years_experience=payload.cv_profile.years_experience,
            cv_summary=payload.cv_profile.summary,
        )
        for j in payload.jobs
    ]
    return {"results": results}


@app.post("/ai/cover-letter")
async def generate_cover_letter(payload: CoverLetterRequest) -> dict[str, str]:
    provider = get_provider()
    skills = ", ".join(payload.cv_profile.skills[:6]) or "software engineering"
    prompt = (
        f"Write a {payload.tone} cover letter for {payload.job.title} at {payload.job.company or 'the company'}. "
        f"Candidate has {payload.cv_profile.years_experience} years experience and skills: {skills}. "
        f"Job description excerpt: {payload.job.description[:800]}"
    )
    generated = await provider.generate(prompt)
    if generated:
        return {"cover_letter": generated}
    company = payload.job.company or "hiring"
    tone = payload.tone.strip().lower()
    if tone == "enthusiastic":
        opening = (
            f"I am thrilled to apply for the {payload.job.title} role at {company}! "
            f"Over {payload.cv_profile.years_experience}+ years building systems with {skills}, "
            "I have loved turning ambitious AI and engineering ideas into reliable products."
        )
    elif tone == "executive":
        opening = (
            f"With {payload.cv_profile.years_experience}+ years of delivery leadership spanning {skills}, "
            f"I am writing to express strong interest in leading outcomes as your {payload.job.title} at {company}."
        )
    else:
        opening = (
            f"With {payload.cv_profile.years_experience}+ years of experience in {skills}, "
            f"I am excited to apply for the {payload.job.title} role at {company}."
        )
    return {
        "cover_letter": f"Dear {company} team,\n\n{opening}\n\nBest regards"
    }


@app.post("/ai/chat")
async def ai_chat(payload: ChatRequest) -> dict[str, str]:
    provider = get_provider()
    context = f"Candidate skills: {', '.join(payload.cv_profile.skills[:8])}."
    if payload.job:
        context += f" Target role: {payload.job.title} at {payload.job.company}."
    generated = await provider.generate(f"{context}\nQuestion: {payload.message}")
    if generated:
        return {"reply": generated}
    if payload.job:
        match = compute_hybrid_score(
            cv_skills=payload.cv_profile.skills,
            job_text=f"{payload.job.title}\n{payload.job.description}",
            years_experience=payload.cv_profile.years_experience,
            cv_summary=payload.cv_profile.summary,
        )
        gaps = ", ".join(match.missing_skills[:3]) or "none detected"
        return {
            "reply": (
                f"Estimated ATS fit for {payload.job.title}: {match.score}/100. "
                f"Priority gaps: {gaps}. Action: {match.action_items[0]}"
            )
        }
    return {
        "reply": (
            f"Focus on quantifying measurable outcomes with "
            f"{', '.join(payload.cv_profile.skills[:4]) or 'your primary stack'}."
        )
    }
