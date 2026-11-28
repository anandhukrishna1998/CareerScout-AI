import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import unittest
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app import main as api_main  # noqa: E402
from app.db import Base  # noqa: E402
from app.dependencies import get_db_session  # noqa: E402
from app.migrations import apply_migrations  # noqa: E402
from app.services.rate_limit import _LOCAL_WINDOWS, check_rate_limit  # noqa: E402


class _ShimSession:
    def __init__(self, s: Session) -> None:
        self._s = s
        self.bind = s.bind

    def add(self, inst: object) -> None:
        self._s.add(inst)

    async def flush(self) -> None:
        self._s.flush()

    async def commit(self) -> None:
        self._s.commit()

    async def refresh(self, inst: object) -> None:
        self._s.refresh(inst)

    async def delete(self, inst: object) -> None:
        self._s.delete(inst)

    async def get(self, entity: type, ident: object) -> object | None:
        return self._s.get(entity, ident)

    async def scalar(self, stmt):  # type: ignore[no-untyped-def]
        return self._s.scalar(stmt)

    async def scalars(self, stmt):  # type: ignore[no-untyped-def]
        return self._s.scalars(stmt)

    async def execute(self, stmt):  # type: ignore[no-untyped-def]
        return self._s.execute(stmt)

    async def close(self) -> None:
        self._s.close()


class MigrationsQuotasBillingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        api_main.settings.upload_dir = self.tmpdir.name
        api_main.settings.stripe_webhook_secret = "whsec_test_secret_2026"
        _LOCAL_WINDOWS.clear()

        self.sync_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.sync_engine)
        self.SyncSession = sessionmaker(bind=self.sync_engine, expire_on_commit=False)

        async def _override_db():
            sess = self.SyncSession()
            shim = _ShimSession(sess)
            try:
                yield shim
            finally:
                await shim.close()

        @asynccontextmanager
        async def _noop_lifespan(_app):
            yield

        self._orig_lifespan = api_main.app.router.lifespan_context
        api_main.app.router.lifespan_context = _noop_lifespan
        api_main.app.dependency_overrides[get_db_session] = _override_db
        self.client = TestClient(api_main.app)

    def tearDown(self) -> None:
        api_main.app.dependency_overrides.clear()
        api_main.app.router.lifespan_context = self._orig_lifespan
        self.sync_engine.dispose()
        self.tmpdir.cleanup()

    def test_idempotent_migrations_upgrade_legacy_schema(self) -> None:
        legacy_engine = create_engine("sqlite:///:memory:")
        with legacy_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(320), password_hash VARCHAR(255), role VARCHAR(32))"
                )
            )
            applied_first = apply_migrations(conn)
            applied_second = apply_migrations(conn)
            cols = {c["name"] for c in inspect(conn).get_columns("users")}

        self.assertEqual(
            applied_first,
            ["0001_saas_user_cv_job_columns", "0002_security_token_version"],
        )
        self.assertEqual(applied_second, [])
        self.assertTrue({"full_name", "plan", "onboarding_completed", "token_version"}.issubset(cols))
        legacy_engine.dispose()

    def test_cv_quota_and_stripe_webhook_upgrade(self) -> None:
        reg = self.client.post(
            "/auth/register",
            json={"email": "quota@example.com", "password": "strongpassword123", "full_name": "Quota"},
        ).json()
        headers = {"Authorization": f"Bearer {reg['access_token']}"}

        # Free plan allows 5 CVs; 6th returns 402
        for idx in range(5):
            r = self.client.post(
                "/cvs/from-text",
                headers=headers,
                json={
                    "filename": f"cv-{idx}.txt",
                    "text": f"Python FastAPI Docker Engineer {idx} with 4 years experience.",
                    "set_primary": idx == 0,
                },
            )
            self.assertEqual(r.status_code, 200, r.text)

        blocked = self.client.post(
            "/cvs/from-text",
            headers=headers,
            json={
                "filename": "cv-6.txt",
                "text": "Sixth CV exceeding free tier quota with Python and Docker.",
                "set_primary": False,
            },
        )
        self.assertEqual(blocked.status_code, 402)

        # Invalid Stripe webhook signature rejected
        payload_bytes = json.dumps(
            {
                "type": "checkout.session.completed",
                "data": {"object": {"customer_email": "quota@example.com"}},
            }
        ).encode("utf-8")
        bad_wh = self.client.post(
            "/billing/webhook",
            content=payload_bytes,
            headers={"stripe-signature": "t=123,v1=deadbeef"},
        )
        self.assertEqual(bad_wh.status_code, 400)

        # Expired Stripe webhook timestamp (>300s) rejected even with valid HMAC
        stale_ts = str(int(time.time()) - 600)
        stale_sig = hmac.new(
            b"whsec_test_secret_2026",
            f"{stale_ts}.".encode("utf-8") + payload_bytes,
            hashlib.sha256,
        ).hexdigest()
        stale_wh = self.client.post(
            "/billing/webhook",
            content=payload_bytes,
            headers={"stripe-signature": f"t={stale_ts},v1={stale_sig}"},
        )
        self.assertEqual(stale_wh.status_code, 400)

        # Valid signed Stripe webhook upgrades plan to pro and unlocks 6th CV
        ts = str(int(time.time()))
        sig = hmac.new(
            b"whsec_test_secret_2026",
            f"{ts}.".encode("utf-8") + payload_bytes,
            hashlib.sha256,
        ).hexdigest()
        good_wh = self.client.post(
            "/billing/webhook",
            content=payload_bytes,
            headers={"stripe-signature": f"t={ts},v1={sig}"},
        )
        self.assertEqual(good_wh.status_code, 200)

        status_res = self.client.get("/billing/status", headers=headers)
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["plan"], "pro")

        unlocked = self.client.post(
            "/cvs/from-text",
            headers=headers,
            json={
                "filename": "cv-6.txt",
                "text": "Sixth CV now allowed under Pro plan with Python and Docker.",
                "set_primary": False,
            },
        )
        self.assertEqual(unlocked.status_code, 200)

    def test_rate_limit_blocks_excess_requests(self) -> None:
        from fastapi import HTTPException

        check_rate_limit("unit-key", limit=2, window_seconds=60)
        check_rate_limit("unit-key", limit=2, window_seconds=60)
        with self.assertRaises(HTTPException) as ctx:
            check_rate_limit("unit-key", limit=2, window_seconds=60)
        self.assertEqual(ctx.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
