from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.providers.factory import get_provider
from app.scoring import MatchResult, compute_hybrid_score, extract_skills

app = FastAPI(title="CareerScout AI Engine", version="0.1.0")


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


class ATSScoreRequest(BaseModel):
    cv_profile: CVProfile
    job: JobPayload


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/llm/generate")
async def llm_generate(payload: PromptRequest) -> dict[str, str]:
    provider = get_provider()
    text = await provider.generate(payload.prompt)
    return {"text": text}


@app.post("/embeddings")
async def embeddings(payload: EmbedRequest) -> dict[str, object]:
    provider = get_provider()
    vector = await provider.embed(payload.text)
    return {"vector": vector, "dimensions": len(vector)}


@app.post("/cv/parse")
async def parse_cv(payload: CVParseRequest) -> dict[str, object]:
    text = payload.text.strip()
    skills = extract_skills(text)
    years = 0
    for token in text.lower().replace("+", " ").split():
        if token.isdigit():
            years = max(years, int(token))
    languages = [lang for lang in ["english", "french", "spanish", "german"] if lang in text.lower()]
    summary = "Parsed CV profile with detected skills and experience signals."
    return {
        "summary": summary,
        "skills": skills,
        "languages": languages,
        "years_experience": min(years, 40),
    }


@app.post("/ats/score-job", response_model=MatchResult)
async def ats_score_job(payload: ATSScoreRequest) -> MatchResult:
    job_text = f"{payload.job.title}\n{payload.job.description}\n{payload.job.location}"
    return compute_hybrid_score(
        cv_skills=payload.cv_profile.skills,
        job_text=job_text,
        years_experience=payload.cv_profile.years_experience,
    )
