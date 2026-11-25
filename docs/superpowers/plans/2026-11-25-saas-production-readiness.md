# CareerScout AI SaaS Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the CareerScout AI scaffold into a secure, end-to-end working, testable multi-tenant SaaS product by restoring missing frontend core modules, implementing the full FastAPI/AI-engine/worker contracts, hardening auth/encryption/rate-limiting, and wiring automated CI verification.

**Architecture:** The Next.js frontend (`apps/web`) communicates over typed fetch helpers with a FastAPI API (`apps/api`) backed by PostgreSQL + pgvector, Alembic migrations, encrypted local/S3 CV storage, and Redis. Background scraping, batch ATS scoring, and scheduled HTML email digests run asynchronously through Redis queues consumed by `apps/worker` and triggered by `apps/scheduler`, while `apps/ai-engine` provides Gemini-backed (with deterministic fallback) CV parsing, embeddings, ATS 60/25/15 scoring, cover letters, and career coach chat.

**Tech Stack:** Next.js 15, TypeScript, Zustand, TanStack Query, FastAPI, SQLAlchemy 2.0 (asyncpg + PostgreSQL/SQLite for unit tests), Alembic, Pydantic v2, Redis, httpx, pypdf, python-docx, cryptography (Fernet/AES-GCM), argon2-cffi/pwdlib, pytest, uv, pnpm.

**Spec:** Derived directly from the frontend API contracts in `apps/web/app/**` and `apps/web/tests/verify-ui.py`, plus `ARCHITECTURE.md` and `.env.example`.

## Global Constraints

- Preserve all existing Nordic Botanical UI tokens, routes, and accessibility guarantees verified by `apps/web/tests/*.test.mjs` and `apps/web/tests/verify-ui.py`.
- All API routes except `/healthz`, `/readyz`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/demo`, and public `GET /jobs` / `GET /jobs/{id}` must require an authenticated user via `Depends(get_current_user)`; never hardcode `user_id: int = 1`.
- Admin routes (`/admin/*`) must enforce `role == "admin"` and return HTTP `403` otherwise; `/auth/demo` must be gated by `settings.enable_demo_mode` (disabled in production unless explicitly enabled).
- Uploaded CV bytes must be validated by magic bytes + size (`UPLOAD_MAX_MB`), extracted properly for PDF/DOCX/TXT/MD, encrypted at rest before hitting disk/storage, and authorized by `cv.user_id == current_user.id`.
- No stub credentials or dummy outputs in production code paths: `Settings` must declare every env var referenced across services (`emailer.py`, `storage.py`, `ai-engine`), and `uv.lock` files must be real lockfiles so `uv sync --frozen` succeeds.

## Review Focus

- **Silent `.gitignore` loss of `apps/web/lib/`:** `.gitignore` line 17 contains `lib/`, which silently ignores `apps/web/lib/api.ts` and `apps/web/lib/types.ts`—negate it for `apps/web/lib/` and pin a git-tracked check in Task 1.
- **PDF/DOCX binary corruption & year-parsing bug:** `content.decode("utf-8", errors="ignore")` corrupts binary PDF/DOCX uploads, and `parse_cv` treats `"2024"` as `40` years of experience—pin binary fixture + `"Class of 2024, 3 years experience"` tests in Tasks 3 & 4.
- **Substring false positives in ATS scoring:** Naive `skill in text.lower()` matches `"java"` inside `"javascript"` and `"sql"` inside `"nosql"`—pin word-boundary tests in Task 4.
- **Auth & refresh token reuse / IDOR:** Unauthenticated `user_id=1` defaults and stateless refresh tokens allow account takeover and cross-user CV reads—pin 401/403 cross-user access and refresh rotation tests in Task 2.
- **Unbounded N+1 AI calls & PostgreSQL-only upserts:** Sequential `score_job` HTTP calls per job and `sqlalchemy.dialects.postgresql.insert` break latency and SQLite unit testing—pin batch scoring + dialect-safe upsert tests in Tasks 5 & 6.

---

### Task 1: Restore Frontend Core Client, Types, Auth Store & Fix `.gitignore`

**Files:**
- Modify: `.gitignore`
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/store/auth-store.ts`
- Test: `apps/web/tests/api-and-store.test.mjs`

**Interfaces:**
- Produces in `apps/web/lib/types.ts`: `User`, `TokenPair`, `UserProfile`, `CVItem`, `JobItem`, `JobDetail`, `JobListResponse`, `JobMatchItem`, `SavedJobItem`, `SavedStatus`, `ChatMessage`, `InsightsResponse`, `AnalyticsOverview`, `EmailSettings`, `EmailLog`, `AdminStatus`.
- Produces in `apps/web/lib/api.ts`: `ApiError` class (`status: number`, `message: string`), `apiFetch<T>(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<T>`, `downloadWithAuth(path: string, fallbackFilename: string): Promise<void>`.
- Produces in `apps/web/store/auth-store.ts`: `useAuthStore` Zustand store with `{ user, accessToken, refreshToken, hydrated, setSession(pair: TokenPair), updateUser(patch: Partial<User>), clearSession() }`.

- [ ] **Step 1: Update `.gitignore` so frontend `apps/web/lib/` is never ignored**

Anchor Python's `lib/` rule or add `!apps/web/lib/` and `!apps/web/lib/**` in `.gitignore`.

- [ ] **Step 2: Write the failing test `apps/web/tests/api-and-store.test.mjs`**

Test that:
1. `apiFetch` attaches `Authorization: Bearer <token>` when `skipAuth` is falsy, omits it when `skipAuth: true`, throws `ApiError` with backend `detail` on non-2xx, and refreshes once via `/auth/refresh` on `401` before retrying.
2. `useAuthStore.getState().setSession(pair)` populates `user`, `accessToken`, `refreshToken`; `updateUser({ onboarding_completed: true })` merges safely; `clearSession()` clears all three.
3. `git check-ignore apps/web/lib/api.ts apps/web/lib/types.ts` returns exit code 1 (not ignored).

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test apps/web/tests/api-and-store.test.mjs`
Expected: FAIL with module not found for `../lib/api` and `../store/auth-store`.

- [ ] **Step 4: Implement `apps/web/lib/types.ts`, `apps/web/lib/api.ts`, and `apps/web/store/auth-store.ts`**

Match every field consumed across `apps/web/app/**` and `apps/web/tests/verify-ui.py` (including `FormData` handling where `Content-Type` header is not forced for multipart uploads, and single-flight refresh promise deduplication on concurrent 401s).

- [ ] **Step 5: Run all frontend tests, lint, typecheck, and build**

Run: `node --test apps/web/tests/*.test.mjs && pnpm --filter @careerscout/web lint && pnpm --filter @careerscout/web build`
Expected: All `node:test` suites pass, ESLint passes, Next.js production build succeeds with zero missing module errors.

- [ ] **Step 6: Commit**

```bash
git add .gitignore apps/web/lib/types.ts apps/web/lib/api.ts apps/web/store/auth-store.ts apps/web/tests/api-and-store.test.mjs
git commit -m "fix(web): restore api client, shared types, auth store, and unignore apps/web/lib"
```

---

### Task 2: Real Authentication, Token Rotation, Settings, Migrations & Rate Limiting (`apps/api`)

**Files:**
- Modify: `apps/api/pyproject.toml`
- Modify: `apps/api/app/settings.py`
- Modify: `apps/api/app/models.py`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/security.py`
- Modify: `apps/api/app/dependencies.py`
- Modify: `apps/api/app/routers/auth.py`
- Modify: `apps/api/app/routers/health.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/alembic.ini` & `apps/api/alembic/env.py` + initial migration
- Create: `apps/api/app/services/rate_limit.py`
- Test: `apps/api/tests/test_auth.py`

**Interfaces:**
- Produces in `apps/api/app/dependencies.py`: `get_current_user(...) -> User`, `get_optional_user(...) -> User | None`, `require_admin(...) -> User`.
- Produces in `apps/api/app/routers/auth.py`: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/demo`, `GET /auth/me`, `POST /auth/change-password`, `GET /auth/export`, `DELETE /auth/me`.
- Produces in `apps/api/app/settings.py`: `email_provider`, `resend_api_key`, `sendgrid_api_key`, `email_from`, `upload_dir`, `upload_max_mb`, `cv_encryption_key`, `enable_demo_mode`, `app_env`.

- [ ] **Step 1: Write failing tests in `apps/api/tests/test_auth.py`**

Test:
1. Register creates hashed password (never plaintext), returns `TokenPair` with `user` payload; duplicate email returns `409`.
2. Login rejects wrong password with `401`; valid credentials return new `TokenPair`.
3. Refresh rotates token, marks previous refresh token revoked, and rejects replay of the old refresh token with `401`.
4. Protected routes (`/auth/me`, `/auth/change-password`) return `401` without bearer token; `/auth/demo` returns `403` when `enable_demo_mode=False`.
5. `DELETE /auth/me` deletes user and cascades user records (GDPR erasure); `GET /auth/export` returns portable JSON.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --directory apps/api pytest tests/test_auth.py -v`
Expected: FAIL (missing `user` in `TokenPair`, missing DB persistence, missing `/auth/me`, etc.).

- [ ] **Step 3: Implement `settings.py`, `models.py` (full SaaS schema), `security.py` (Argon2/bcrypt + JTI JWT + token hashing), `dependencies.py`, `rate_limit.py`, `auth.py`, `health.py` (`/readyz` checking DB + Redis), and Alembic setup**

- [ ] **Step 4: Run auth & health tests**

Run: `uv run --directory apps/api pytest tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): implement real auth, refresh token rotation, full settings, rate limiting, and alembic migrations"
```

---

### Task 3: Encrypted CV Storage, Real PDF/DOCX Text Extraction & Full CV Lifecycle (`apps/api`)

**Files:**
- Modify: `apps/api/pyproject.toml` (add `pypdf`, `python-docx`, `cryptography`)
- Create: `apps/api/app/services/storage.py`
- Create: `apps/api/app/services/cv_extractor.py`
- Modify: `apps/api/app/routers/cvs.py`
- Test: `apps/api/tests/test_cvs.py`

**Interfaces:**
- Produces in `apps/api/app/services/storage.py`: `encrypt_and_save(user_id: int, checksum: str, raw: bytes) -> str`, `read_and_decrypt(storage_path: str) -> bytes`, `delete_blob(storage_path: str) -> None`.
- Produces in `apps/api/app/services/cv_extractor.py`: `extract_cv_text(content: bytes, content_type: str, filename: str) -> str`.
- Produces in `apps/api/app/routers/cvs.py`: `GET /cvs`, `POST /cvs/upload`, `POST /cvs/from-text`, `POST /cvs/{cv_id}/primary`, `GET /cvs/{cv_id}/download`, `PATCH /cvs/{cv_id}/parsed`, `DELETE /cvs/{cv_id}`.

- [ ] **Step 1: Write failing tests in `apps/api/tests/test_cvs.py`**

Test:
1. Uploading a binary PDF/DOCX extracts readable text (not raw binary bytes) and rejects spoofed `.exe` renamed to `.pdf` (magic-byte check).
2. Stored file on disk is ciphertext (does not contain plaintext resume string) and `GET /cvs/{id}/download` returns original decrypted bytes with `Content-Disposition`.
3. Cross-user access (`User B` downloading, patching, or deleting `User A`'s CV) returns `404`/`403`.
4. `POST /cvs/from-text` rejects `< 15` characters with `422` and `POST /cvs/{id}/primary` atomically toggles `is_primary`.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --directory apps/api pytest tests/test_cvs.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `storage.py`, `cv_extractor.py`, and all endpoints in `routers/cvs.py`**

- [ ] **Step 4: Run CV tests**

Run: `uv run --directory apps/api pytest tests/test_cvs.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add encrypted CV storage, PDF/DOCX extraction, and full CV CRUD endpoints"
```

---

### Task 4: Upgrade AI Engine (Real Gemini Integration, Fixed CV Parser, Word-Boundary 60/25/15 ATS Scoring & Batch API)

**Files:**
- Modify: `apps/ai-engine/app/providers/gemini.py`
- Modify: `apps/ai-engine/app/scoring.py`
- Modify: `apps/ai-engine/app/main.py`
- Test: `apps/ai-engine/tests/test_ai_engine.py`

**Interfaces:**
- Produces in `apps/ai-engine/app/scoring.py`: `MatchResult` (`score`, `skill_score`, `semantic_score`, `experience_score`, `matched_skills`, `strengths`, `missing_skills`, `action_items`, `recommendation`), `extract_skills(text: str) -> list[str]`, `compute_hybrid_score(...) -> MatchResult`.
- Produces in `apps/ai-engine/app/main.py`: `POST /cv/parse`, `POST /ats/score-job`, `POST /ats/score-batch`, `POST /ai/cover-letter`, `POST /ai/chat`.

- [ ] **Step 1: Write failing tests in `apps/ai-engine/tests/test_ai_engine.py`**

Test:
1. `extract_skills("Built NoSQL pipelines in JavaScript")` does NOT falsely match `"sql"` or `"java"`, while `"Python, C++, FastAPI, PostgreSQL"` matches cleanly.
2. `POST /cv/parse` on `"Graduated 2024. 3+ years building Python FastAPI APIs."` returns `years_experience == 3` (NOT `40`).
3. `compute_hybrid_score` returns `skill_score` in `0..60`, `semantic_score` in `0..25`, `experience_score` in `0..15`, and deterministic `action_items`.
4. `GeminiProvider` calls Gemini REST API when `GEMINI_API_KEY` is valid (verified with `httpx.MockTransport`) and falls back gracefully when unset/placeholder without returning `[Gemini stub]` verbatim to end users in chat/cover-letter flows.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --directory apps/ai-engine pytest tests/test_ai_engine.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `scoring.py`, `gemini.py`, and `main.py` batch/chat/cover-letter routes**

- [ ] **Step 4: Run AI engine tests**

Run: `uv run --directory apps/ai-engine pytest tests/test_ai_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ai-engine
git commit -m "feat(ai-engine): implement word-boundary 60/25/15 scoring, fix year parser, wire Gemini and batch endpoints"
```

---

### Task 5: Implement Full SaaS API Endpoints (Profile, Jobs Explorer, Saved Tracker, Matches, Insights, Analytics, Chat, Email, Admin)

**Files:**
- Modify: `apps/api/app/routers/jobs.py`
- Modify: `apps/api/app/routers/matches.py`
- Modify: `apps/api/app/services/ai_client.py`
- Create: `apps/api/app/routers/profile.py`
- Create: `apps/api/app/routers/saved_jobs.py`
- Create: `apps/api/app/routers/ai.py`
- Create: `apps/api/app/routers/analytics.py`
- Create: `apps/api/app/routers/email_settings.py`
- Create: `apps/api/app/routers/admin.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_saas_endpoints.py`

- [ ] **Step 1: Write failing integration tests in `apps/api/tests/test_saas_endpoints.py`**

Cover all frontend-consumed endpoints:
1. `GET /profile`, `PUT /profile`, `POST /profile/complete-onboarding` (updates `user.onboarding_completed`).
2. `GET /jobs` filtering (`q`, `country`, `city`, `technologies`, `remote_mode`, `source`, `posting_age_hours`, `min_score`, `sort`), pagination, `available_sources`, `available_countries`, and `GET /jobs/{id}` returning HTTP `404` for unknown IDs.
3. `POST /saved-jobs`, `GET /saved-jobs`, `PATCH /saved-jobs/{job_id}`, `DELETE /saved-jobs/{job_id}` (auto-sets `applied_at` when stage transitions to `"applied"`).
4. `GET /matches/daily`, `GET /matches/insights`, `GET /analytics/overview`.
5. `POST /ai/cover-letter`, `GET /ai/chat/history`, `POST /ai/chat`, `DELETE /ai/chat/history`.
6. `GET /email-settings`, `PUT /email-settings`, `GET /email-settings/preview`, `GET /email-settings/logs`, `POST /email-settings/test-digest`.
7. `GET /admin/status` and `POST /admin/scrape` returning `403` for non-admin users and `200` for admins.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --directory apps/api pytest tests/test_saas_endpoints.py -v`
Expected: FAIL

- [ ] **Step 3: Implement routers and dialect-agnostic upsert helper (PostgreSQL `on_conflict_do_update` + portable fallback), batch AI scoring client, and wire routers in `apps/api/app/main.py`**

- [ ] **Step 4: Run full API test suite**

Run: `uv run --directory apps/api pytest -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): implement profile, explorer, tracker, insights, analytics, AI chat, email settings, and admin APIs"
```

---

### Task 6: Worker Queue Consumer, Scheduler Dispatch, Adapter Fixes, SaaS Quotas & CI Hardening

**Files:**
- Modify: `apps/worker/app/adapters/greenhouse.py` (pass `?content=true`, strip HTML cleanly)
- Modify: `apps/worker/app/adapters/weworkremotely.py` (parse `<description>`)
- Modify: `apps/worker/app/adapters/rss_feed.py` & `apps/worker/app/adapters/remoteok.py` (honor `SCRAPE_HOURS_OLD` + HTML sanitization)
- Modify: `apps/worker/app/scrape_orchestrator.py` (bounded concurrency with `asyncio.Semaphore` + per-source error isolation + `ScrapeRun` telemetry)
- Modify: `apps/worker/app/main.py` (Redis queue consumer loop for `scrape.run` & `email.digest` alongside CLI `--once` flag)
- Modify: `apps/scheduler/app/main.py` (push Redis tasks for daily scrape + user digest matching)
- Modify: `apps/api/app/models.py` & `apps/api/app/services/quotas.py` (Free vs Pro SaaS plan limits on CVs / AI messages / cover letters + Stripe webhook scaffold)
- Modify: `.github/workflows/ci.yml`
- Regenerate: `apps/*/uv.lock` via `uv lock`
- Test: `apps/worker/tests/test_adapters_and_orchestrator.py` & `apps/scheduler/tests/test_scheduler.py`

- [ ] **Step 1: Write failing tests in `apps/worker/tests/test_adapters_and_orchestrator.py` and `apps/scheduler/tests/test_scheduler.py`**

Test Greenhouse `?content=true` description extraction, WeWorkRemotely `<description>` parsing, `SCRAPE_HOURS_OLD` filtering, orchestrator isolation when one adapter raises an exception, and scheduler pushing expected Redis payloads.

- [ ] **Step 2: Run worker & scheduler tests to verify failure**

Run: `uv run --directory apps/worker pytest -v && uv run --directory apps/scheduler pytest -v`
Expected: FAIL

- [ ] **Step 3: Implement adapter fixes, Redis queue producer/consumer, `ScrapeRun` logging, SaaS plan quota service, lockfile generation, and CI pipeline updates**

- [ ] **Step 4: Run full monorepo verification**

Run:
```bash
node --test apps/web/tests/*.test.mjs
pnpm --filter @careerscout/web lint
pnpm --filter @careerscout/web build
uv run --directory apps/api pytest -v
uv run --directory apps/ai-engine pytest -v
uv run --directory apps/worker pytest -v
uv run --directory apps/scheduler pytest -v
```
Expected: All frontend tests, lint, Next.js build, and all 4 Python service pytest suites pass; `docker compose config` validates cleanly.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: wire worker/scheduler Redis queues, fix adapters, add SaaS quotas, lockfiles, and full CI"
```
