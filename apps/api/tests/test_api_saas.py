import asyncio
import os
import sys
import tempfile
import unittest
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

os.environ.setdefault("JWT_SECRET", "test-secret-for-careerscout-unit-tests-2026")
os.environ.setdefault("APP_ENV", "development")

from app import main as api_main  # noqa: E402
from app.db import Base  # noqa: E402
from app.dependencies import get_db_session  # noqa: E402
from app.models import Job  # noqa: E402


class _AsyncSessionShim:
    """AsyncSession-compatible shim backed by a synchronous SQLite Session."""

    def __init__(self, sync_session: Session) -> None:
        self._s = sync_session
        self.bind = sync_session.bind

    def add(self, instance: object) -> None:
        self._s.add(instance)

    async def flush(self) -> None:
        self._s.flush()

    async def commit(self) -> None:
        self._s.commit()

    async def refresh(self, instance: object) -> None:
        self._s.refresh(instance)

    async def delete(self, instance: object) -> None:
        self._s.delete(instance)

    async def get(self, entity: type, ident: object) -> object | None:
        return self._s.get(entity, ident)

    async def scalar(self, statement):  # type: ignore[no-untyped-def]
        return self._s.scalar(statement)

    async def scalars(self, statement):  # type: ignore[no-untyped-def]
        return self._s.scalars(statement)

    async def execute(self, statement):  # type: ignore[no-untyped-def]
        return self._s.execute(statement)

    async def close(self) -> None:
        self._s.close()


class CareerScoutApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        api_main.settings.upload_dir = self.tmpdir.name
        api_main.settings.enable_demo_mode = True
        api_main.settings.app_env = "development"

        self.sync_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.sync_engine)
        self.SyncSession = sessionmaker(bind=self.sync_engine, expire_on_commit=False)

        with self.SyncSession() as seed_db:
            seed_db.add_all(
                [
                    Job(
                        source="greenhouse",
                        external_id="gh-1",
                        title="Senior AI & LLM Engineer",
                        company="Mistral Studio",
                        location="Paris, France",
                        country="France",
                        city="Paris",
                        remote_mode="hybrid",
                        contract_type="CDI",
                        experience_level="senior",
                        salary_text="75k-95k EUR",
                        skills=["Python", "FastAPI", "LLM", "RAG", "Docker"],
                        description="Build FastAPI LLM RAG services with Python, Docker, and Kubernetes.",
                        apply_url="https://example.com/jobs/1",
                        posted_at=datetime.now(tz=timezone.utc),
                    ),
                    Job(
                        source="remoteok",
                        external_id="ro-2",
                        title="Backend Platform Engineer",
                        company="Nordic Cloud",
                        location="Worldwide",
                        country="Worldwide",
                        city="Remote",
                        remote_mode="remote",
                        contract_type="Full-time",
                        experience_level="mid",
                        salary_text="70k-85k EUR",
                        skills=["Python", "PostgreSQL", "Redis"],
                        description="Scale Python PostgreSQL Redis microservices.",
                        apply_url="https://example.com/jobs/2",
                        posted_at=datetime.now(tz=timezone.utc),
                    ),
                ]
            )
            seed_db.commit()

        async def _override_db():
            sync_sess = self.SyncSession()
            shim = _AsyncSessionShim(sync_sess)
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

    def _register(self, email: str = "ada@example.com", password: str = "strongpass123") -> dict:
        res = self.client.post(
            "/auth/register",
            json={"email": email, "password": password, "full_name": "Ada Test"},
        )
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()

    def test_auth_register_login_refresh_rotation_and_gdpr(self) -> None:
        pair = self._register()
        self.assertEqual(pair["user"]["email"], "ada@example.com")
        self.assertFalse(pair["user"]["onboarding_completed"])

        # Duplicate email fails
        dup = self.client.post(
            "/auth/register",
            json={"email": "ada@example.com", "password": "strongpass123", "full_name": "Dup"},
        )
        self.assertEqual(dup.status_code, 409)

        # Wrong password fails
        bad_login = self.client.post(
            "/auth/login",
            json={"email": "ada@example.com", "password": "wrongpassword"},
        )
        self.assertEqual(bad_login.status_code, 401)

        # Refresh token rotation & replay prevention
        ref1 = pair["refresh_token"]
        rotated = self.client.post("/auth/refresh", json={"refresh_token": ref1})
        self.assertEqual(rotated.status_code, 200, rotated.text)
        ref2 = rotated.json()["refresh_token"]
        self.assertNotEqual(ref1, ref2)

        replay = self.client.post("/auth/refresh", json={"refresh_token": ref1})
        self.assertEqual(replay.status_code, 401)

        # Protected /auth/me & export & delete
        headers = {"Authorization": f"Bearer {rotated.json()['access_token']}"}
        me = self.client.get("/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200)
        export_res = self.client.get("/auth/export", headers=headers)
        self.assertEqual(export_res.status_code, 200)
        del_res = self.client.delete("/auth/me", headers=headers)
        self.assertEqual(del_res.status_code, 200)

    def test_cv_encryption_extraction_and_cross_user_isolation(self) -> None:
        user_a = self._register("usera@example.com")
        user_b = self._register("userb@example.com")
        headers_a = {"Authorization": f"Bearer {user_a['access_token']}"}
        headers_b = {"Authorization": f"Bearer {user_b['access_token']}"}

        # Spoofed PDF rejected
        spoof = self.client.post(
            "/cvs/upload",
            headers=headers_a,
            files={"file": ("fake.pdf", b"not-a-real-pdf", "application/pdf")},
        )
        self.assertEqual(spoof.status_code, 400)

        # Valid DOCX upload -> extracted, encrypted on disk, decrypted on download
        docx_path = Path(self.tmpdir.name) / "sample.docx"
        with zipfile.ZipFile(docx_path, "w") as zf:
            zf.writestr(
                "word/document.xml",
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                "<w:body><w:p><w:r><w:t>Senior Python FastAPI RAG Engineer 5 years experience</w:t></w:r></w:p></w:body>"
                "</w:document>",
            )
        docx_bytes = docx_path.read_bytes()
        up = self.client.post(
            "/cvs/upload",
            headers=headers_a,
            files={
                "file": (
                    "resume.docx",
                    docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
        self.assertEqual(up.status_code, 200, up.text)
        cv_data = up.json()
        self.assertIn("Python", cv_data["parsed"]["skills"])
        self.assertEqual(cv_data["parsed"]["years_experience"], 5)

        # On disk file must be encrypted ciphertext
        enc_files = list(Path(self.tmpdir.name).rglob("*.enc"))
        self.assertEqual(len(enc_files), 1)
        self.assertNotIn(b"FastAPI", enc_files[0].read_bytes())

        # Download returns decrypted original DOCX bytes
        dl = self.client.get(f"/cvs/{cv_data['id']}/download", headers=headers_a)
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(dl.content, docx_bytes)

        # User B cannot access User A's CV
        self.assertEqual(
            self.client.get(f"/cvs/{cv_data['id']}/download", headers=headers_b).status_code, 404
        )
        self.assertEqual(
            self.client.delete(f"/cvs/{cv_data['id']}", headers=headers_b).status_code, 404
        )

    def test_end_to_end_saas_workflows_and_admin_rbac(self) -> None:
        user_pair = self._register("candidate@example.com")
        u_headers = {"Authorization": f"Bearer {user_pair['access_token']}"}

        # Non-admin blocked from /admin/status
        self.assertEqual(self.client.get("/admin/status", headers=u_headers).status_code, 403)

        # Demo user has admin role
        demo = self.client.post("/auth/demo").json()
        admin_headers = {"Authorization": f"Bearer {demo['access_token']}"}
        admin_status = self.client.get("/admin/status", headers=admin_headers)
        self.assertEqual(admin_status.status_code, 200, admin_status.text)
        self.assertEqual(admin_status.json()["metrics"]["total_jobs"], 2)

        # Onboarding + CV text
        cv_res = self.client.post(
            "/cvs/from-text",
            headers=u_headers,
            json={
                "filename": "cv.txt",
                "text": "Senior AI Engineer with 6 years experience in Python, FastAPI, LLM, RAG, Docker.",
                "set_primary": True,
            },
        )
        self.assertEqual(cv_res.status_code, 200, cv_res.text)

        onb = self.client.post(
            "/profile/complete-onboarding",
            headers=u_headers,
            json={
                "headline": "Senior AI Engineer",
                "country": "France",
                "preferred_countries": ["France"],
                "cities": ["Paris"],
                "experience_level": "senior",
                "years_experience": 6,
                "preferred_roles": ["AI Engineer"],
                "technologies": ["Python", "FastAPI", "LLM", "RAG", "Docker"],
                "languages": ["English", "French"],
                "salary_expectation": "85k EUR",
                "remote_preference": "hybrid",
                "visa_required": False,
            },
        )
        self.assertEqual(onb.status_code, 200)
        self.assertTrue(onb.json()["onboarding_completed"])

        # Jobs Explorer filtering + 404 handling
        jobs_list = self.client.get("/jobs?country=France&sort=score", headers=u_headers)
        self.assertEqual(jobs_list.status_code, 200)
        self.assertEqual(jobs_list.json()["total"], 1)
        job_id = jobs_list.json()["items"][0]["id"]
        self.assertIsNotNone(jobs_list.json()["items"][0]["score"])
        self.assertEqual(self.client.get("/jobs/999999", headers=u_headers).status_code, 404)

        # Daily matches, insights, analytics
        daily = self.client.get("/matches/daily", headers=u_headers)
        self.assertEqual(daily.status_code, 200)
        self.assertGreaterEqual(len(daily.json()), 1)

        insights = self.client.get("/matches/insights", headers=u_headers)
        self.assertEqual(insights.status_code, 200)
        self.assertGreater(insights.json()["jobs_analyzed"], 0)

        analytics = self.client.get("/analytics/overview", headers=u_headers)
        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(analytics.json()["kpis"]["total_jobs"], 2)

        # Saved jobs + cover letter + chat
        saved = self.client.post(
            "/saved-jobs",
            headers=u_headers,
            json={"job_id": job_id, "status": "applied", "notes": "Applied directly"},
        )
        self.assertEqual(saved.status_code, 200)
        self.assertIsNotNone(saved.json()["applied_at"])

        cl = self.client.post(
            "/ai/cover-letter",
            headers=u_headers,
            json={"job_id": job_id, "tone": "concise"},
        )
        self.assertEqual(cl.status_code, 200)
        self.assertIn("Mistral Studio", cl.json()["cover_letter"])

        chat = self.client.post(
            "/ai/chat",
            headers=u_headers,
            json={"message": "How do I prep?", "job_id": job_id},
        )
        self.assertEqual(chat.status_code, 200)
        self.assertIn("reply", chat.json())

        # Email preview & test digest
        digest = self.client.post("/email-settings/test-digest", headers=u_headers)
        self.assertEqual(digest.status_code, 200)
        self.assertEqual(digest.json()["status"], "simulated")


if __name__ == "__main__":
    unittest.main()
