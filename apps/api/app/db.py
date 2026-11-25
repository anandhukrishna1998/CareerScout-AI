from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.settings import settings


class Base(DeclarativeBase):
    pass


class _SyncAsyncSessionShim:
    """AsyncSession-compatible wrapper for local SQLite execution without async drivers."""

    def __init__(self, sync_session: Session) -> None:
        self._s = sync_session
        self.bind = sync_session.bind

    def add(self, instance: object) -> None:
        self._s.add(instance)

    def add_all(self, instances: list[object]) -> None:
        self._s.add_all(instances)

    async def flush(self) -> None:
        self._s.flush()

    async def commit(self) -> None:
        self._s.commit()

    async def rollback(self) -> None:
        self._s.rollback()

    async def refresh(self, instance: object) -> None:
        self._s.refresh(instance)

    async def delete(self, instance: object) -> None:
        self._s.delete(instance)

    async def get(self, entity: type, ident: object) -> Any:
        return self._s.get(entity, ident)

    async def scalar(self, statement: Any) -> Any:
        return self._s.scalar(statement)

    async def scalars(self, statement: Any) -> Any:
        return self._s.scalars(statement)

    async def execute(self, statement: Any) -> Any:
        return self._s.execute(statement)

    async def close(self) -> None:
        self._s.close()


class _SyncAsyncConnectionShim:
    def __init__(self, conn: Connection) -> None:
        self._conn = conn

    async def run_sync(self, fn: Any, *args: Any, **kwargs: Any) -> Any:
        return fn(self._conn, *args, **kwargs)

    async def execute(self, statement: Any) -> Any:
        return self._conn.execute(statement)


class _SyncAsyncEngineShim:
    def __init__(self, sync_engine: Any) -> None:
        self._sync_engine = sync_engine

    @asynccontextmanager
    async def begin(self) -> AsyncIterator[_SyncAsyncConnectionShim]:
        with self._sync_engine.begin() as conn:
            yield _SyncAsyncConnectionShim(conn)

    async def dispose(self) -> None:
        self._sync_engine.dispose()


def _is_sqlite_url(url: str) -> bool:
    return url.startswith("sqlite:")


def _ensure_sqlite_parent(url: str) -> str:
    if url.startswith("sqlite:///") and ":memory:" not in url:
        raw_path = url.replace("sqlite:///", "", 1)
        Path(raw_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    return url


if _is_sqlite_url(settings.database_url):
    _db_url = _ensure_sqlite_parent(settings.database_url)
    _kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in _db_url:
        _kwargs["poolclass"] = StaticPool
    _sync_engine = create_engine(_db_url, **_kwargs)
    _SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)
    engine: Any = _SyncAsyncEngineShim(_sync_engine)

    @asynccontextmanager
    async def SessionLocal() -> AsyncIterator[_SyncAsyncSessionShim]:  # type: ignore[misc]
        sess = _SyncSessionLocal()
        shim = _SyncAsyncSessionShim(sess)
        try:
            yield shim
        finally:
            await shim.close()
else:
    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def check_db_ready() -> None:
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
