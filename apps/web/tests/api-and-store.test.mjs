import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const webRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(webRoot, "../..");
const webRequire = createRequire(path.join(webRoot, "package.json"));
const ts = webRequire("typescript");

function loadTsModule(relPath, mocks = {}) {
  const cache = new Map();

  function resolveFile(basePath) {
    for (const candidate of [`${basePath}.tsx`, `${basePath}.ts`, `${basePath}.mjs`, basePath]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  function compileAndRun(filePath) {
    if (cache.has(filePath)) return cache.get(filePath).exports;
    const source = fs.readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const mod = { exports: {} };
    cache.set(filePath, mod);

    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) {
        const resolved = resolveFile(path.join(webRoot, specifier.slice(2)));
        if (resolved) return compileAndRun(resolved);
      }
      if (specifier.startsWith(".")) {
        const resolved = resolveFile(path.resolve(path.dirname(filePath), specifier));
        if (resolved) return compileAndRun(resolved);
      }
      return webRequire(specifier);
    };

    const fn = new Function("require", "module", "exports", outputText);
    fn(localRequire, mod, mod.exports);
    return mod.exports;
  }

  return compileAndRun(path.join(webRoot, relPath));
}

test("apps/web/lib/api.ts and apps/web/lib/types.ts are not gitignored", () => {
  for (const rel of ["apps/web/lib/api.ts", "apps/web/lib/types.ts"]) {
    let ignored = false;
    try {
      execFileSync("git", ["check-ignore", "-q", rel], { cwd: repoRoot });
      ignored = true;
    } catch {
      ignored = false;
    }
    assert.equal(ignored, false, `${rel} must not be ignored by .gitignore`);
  }
});

test("useAuthStore manages session, user patch, and clearSession", () => {
  const { useAuthStore } = loadTsModule("store/auth-store.ts");
  useAuthStore.getState().clearSession();

  const pair = {
    access_token: "acc-1",
    refresh_token: "ref-1",
    token_type: "bearer",
    user: {
      id: 42,
      email: "dev@careerscout.ai",
      full_name: "Ada Dev",
      role: "user",
      onboarding_completed: false,
    },
  };
  useAuthStore.getState().setSession(pair);
  assert.equal(useAuthStore.getState().accessToken, "acc-1");
  assert.equal(useAuthStore.getState().refreshToken, "ref-1");
  assert.equal(useAuthStore.getState().user?.email, "dev@careerscout.ai");

  useAuthStore.getState().updateUser({ onboarding_completed: true });
  assert.equal(useAuthStore.getState().user?.onboarding_completed, true);

  useAuthStore.getState().clearSession();
  assert.equal(useAuthStore.getState().accessToken, null);
  assert.equal(useAuthStore.getState().user, null);
});

test("apiFetch attaches auth header, skips on skipAuth, and refreshes once on 401", async () => {
  const { useAuthStore } = loadTsModule("store/auth-store.ts");
  useAuthStore.getState().setSession({
    access_token: "old-token",
    refresh_token: "refresh-1",
    token_type: "bearer",
    user: { id: 1, email: "a@b.com", full_name: "A", role: "user", onboarding_completed: true },
  });

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const authHeader = new Headers(init.headers).get("Authorization");
    calls.push({ url, method: init.method ?? "GET", authHeader });
    if (url.endsWith("/auth/refresh")) {
      return new Response(
        JSON.stringify({
          access_token: "new-token",
          refresh_token: "refresh-2",
          token_type: "bearer",
          user: { id: 1, email: "a@b.com", full_name: "A", role: "user", onboarding_completed: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/protected") && authHeader === "Bearer old-token") {
      return new Response(JSON.stringify({ detail: "Expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/protected") && authHeader === "Bearer new-token") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/public")) {
      assert.equal(authHeader, null);
      return new Response(JSON.stringify({ public: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { apiFetch, ApiError } = loadTsModule("lib/api.ts", {
      "@/store/auth-store": { useAuthStore },
    });

    const pub = await apiFetch("/public", { skipAuth: true });
    assert.deepEqual(pub, { public: true });

    const res = await apiFetch("/protected");
    assert.deepEqual(res, { ok: true });
    assert.equal(useAuthStore.getState().accessToken, "new-token");
    assert.equal(useAuthStore.getState().refreshToken, "refresh-2");

    await assert.rejects(
      () => apiFetch("/missing"),
      (err) => err instanceof ApiError && err.status === 404 && err.message === "Not Found",
    );
  } finally {
    globalThis.fetch = originalFetch;
    useAuthStore.getState().clearSession();
  }
});
