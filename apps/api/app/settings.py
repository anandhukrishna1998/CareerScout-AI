import json
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    enable_demo_mode: bool = True
    europe_only_jobs: bool = True
    api_cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost",
    ]
    jwt_secret: str = "change-me-super-long-secret"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    database_url: str = "postgresql+asyncpg://careerscout:careerscout@postgres:5432/careerscout"
    redis_url: str = "redis://redis:6379/0"
    ai_engine_url: str = "http://ai-engine:8010"

    upload_dir: str = "./storage/cvs"
    upload_max_mb: int = 10
    cv_encryption_key: str = ""

    email_provider: str = "resend"
    resend_api_key: str = ""
    sendgrid_api_key: str = ""
    email_from: str = "no-reply@careerscout.ai"

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    scrape_sources: str = "jobicy,ashby,greenhouse,lever,arbeitnow,france_travail,apec,indeed"
    serpapi_key: str = ""
    greenhouse_companies: str = "algolia,mirakl,datacamp"
    lever_companies: str = "swile"
    ashby_companies: str = "alan,pennylane,dust,nabla,photoroom,deepl"
    france_travail_access_token: str = ""
    apec_api_url: str = ""

    @model_validator(mode="after")
    def _enforce_production_secrets(self) -> "Settings":
        if self.app_env.lower() not in {"development", "local", "test"}:
            if (
                self.jwt_secret == "change-me-super-long-secret"
                or len(self.jwt_secret.strip()) < 32
            ):
                raise ValueError(
                    "JWT_SECRET must be a strong non-default secret (>=32 chars) outside development"
                )
            if not self.cv_encryption_key.strip():
                raise ValueError("CV_ENCRYPTION_KEY must be explicitly set outside development")
        return self

    @field_validator("api_cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> list[str]:
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return ["http://localhost:3000"]
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(v).strip() for v in parsed if str(v).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in raw.split(",") if item.strip()]
        return ["http://localhost:3000"]

    @property
    def demo_enabled(self) -> bool:
        return self.enable_demo_mode and self.app_env.lower() in {"development", "local", "test"}


settings = Settings()
