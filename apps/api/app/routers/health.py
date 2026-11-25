from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import check_db_ready

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> JSONResponse:
    try:
        await check_db_ready()
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": str(exc)[:120]},
        )
    return JSONResponse(status_code=200, content={"status": "ok", "database": "ok"})
