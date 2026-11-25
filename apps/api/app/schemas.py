from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    onboarding_completed: bool


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    headline: str = Field(default="AI & Python Engineer", max_length=255)
    country: str = Field(default="France", max_length=128)
    preferred_countries: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    experience_level: str = Field(default="mid", max_length=32)
    years_experience: int = Field(default=3, ge=0, le=60)
    preferred_roles: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    salary_expectation: str = Field(default="", max_length=128)
    remote_preference: Literal["any", "remote", "hybrid", "onsite"] = "hybrid"
    visa_required: bool = False


class CVFromTextRequest(BaseModel):
    filename: str = Field(default="pasted-cv.txt", max_length=255)
    text: str = Field(min_length=15, max_length=200_000)
    set_primary: bool = True


class CVParsedPatchRequest(BaseModel):
    summary: str = Field(default="", max_length=5000)
    skills: list[str] = Field(default_factory=list)
    years_experience: int = Field(default=0, ge=0, le=60)
    languages: list[str] | None = None
    experience_level: str | None = None


class SavedJobUpsertRequest(BaseModel):
    job_id: int
    status: Literal["saved", "applied", "interviewing", "offer", "rejected"] = "saved"
    notes: str | None = Field(default=None, max_length=5000)


class SavedJobPatchRequest(BaseModel):
    status: Literal["saved", "applied", "interviewing", "offer", "rejected"] | None = None
    notes: str | None = Field(default=None, max_length=5000)


class JobIngestRequest(BaseModel):
    sources: list[str] = Field(default_factory=lambda: ["remoteok", "arbeitnow", "remotive"])
    query: str = ""
    location: str = ""
    hours_old: int = Field(default=720, ge=1, le=8760)


class CoverLetterRequest(BaseModel):
    job_id: int
    tone: Literal["concise", "enthusiastic", "executive"] = "concise"


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    job_id: int | None = None


class EmailSettingsUpdateRequest(BaseModel):
    digest_enabled: bool = True
    frequency: Literal["daily", "weekdays", "weekly"] = "daily"
    send_hour: int = Field(default=8, ge=0, le=23)
    timezone: str = Field(default="Europe/Paris", max_length=64)
    min_match_score: int = Field(default=70, ge=0, le=95)
    max_jobs_per_email: int = Field(default=8, ge=1, le=25)
    subject_template: str = Field(
        default="Top AI & Data jobs matching your profile today", max_length=255
    )
    recipient_email: EmailStr


class JobMatchResponse(BaseModel):
    job_id: int
    title: str
    company: str
    location: str
    country: str
    city: str
    remote_mode: str
    source: str
    apply_url: str
    posted_at: str
    salary_text: str = ""
    is_saved: bool = False
    score: int
    skill_score: int = 0
    semantic_score: int = 0
    experience_score: int = 0
    matched_skills: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    recommendation: str
