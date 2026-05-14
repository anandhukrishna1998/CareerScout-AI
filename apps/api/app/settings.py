from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_cors_origins: list[str] = ["http://localhost:3000"]
    jwt_secret: str = "change-me"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    database_url: str = "postgresql+asyncpg://careerscout:careerscout@postgres:5432/careerscout"
    redis_url: str = "redis://redis:6379/0"
    ai_engine_url: str = "http://ai-engine:8010"


settings = Settings()
