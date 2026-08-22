from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class JobMatchResponse(BaseModel):
    job_id: int
    title: str
    company: str
    location: str
    apply_url: str
    score: int
    strengths: list[str]
    missing_skills: list[str]
    recommendation: str


class SavedJobResponse(BaseModel):
    id: int
    job_id: int
    title: str
    company: str
    location: str
    apply_url: str
    saved_at: str


class PreferenceSchema(BaseModel):
    locations: str = ""
    salary_min: int = 0
    salary_max: int = 0
    remote_only: bool = False
    visa_sponsorship: bool = False


class ScrapeRequest(BaseModel):
    keyword: str
    location: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
