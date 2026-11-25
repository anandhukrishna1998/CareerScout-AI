from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.db import Base, engine
from app.migrations import apply_migrations
from app.routers import (
    admin,
    ai,
    analytics,
    auth,
    billing,
    cvs,
    email_settings,
    health,
    jobs,
    matches,
    profile,
    saved_jobs,
)
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(apply_migrations)
    yield


app = FastAPI(title="CareerScout API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(cvs.router, prefix="/cvs", tags=["cvs"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(saved_jobs.router, prefix="/saved-jobs", tags=["saved-jobs"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
app.include_router(email_settings.router, prefix="/email-settings", tags=["email-settings"])
app.include_router(billing.router, prefix="/billing", tags=["billing"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
