from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
from app import models  # noqa: F401
from app.routers import auth, cvs, health, jobs, matches
from app.settings import settings

app = FastAPI(title="CareerScout API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(cvs.router, prefix="/cvs", tags=["cvs"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])


@app.on_event("startup")
async def startup_create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
