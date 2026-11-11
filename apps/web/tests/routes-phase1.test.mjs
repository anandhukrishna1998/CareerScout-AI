import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  LIGHT_TOKENS,
  DARK_TOKENS,
  contrastRatio,
  clampScore,
  scoreBand,
} from "../lib/theme-tokens.mjs";

const webRoot = path.resolve(import.meta.dirname, "..");
const webRequire = createRequire(path.join(webRoot, "package.json"));
const ts = webRequire("typescript");
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");

function resolveCandidateFile(basePath) {
  for (const candidate of [`${basePath}.tsx`, `${basePath}.ts`, `${basePath}.mjs`, basePath]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadPageModule(relPath, mocks = {}) {
  const cache = new Map();

  function compileAndRun(filePath) {
    if (cache.has(filePath)) {
      return cache.get(filePath).exports;
    }

    const source = fs.readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const moduleObj = { exports: {} };
    cache.set(filePath, moduleObj);

    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) {
        return mocks[specifier];
      }
      if (specifier === "@/lib/theme-tokens" || specifier === "@/lib/theme-tokens.mjs") {
        return { LIGHT_TOKENS, DARK_TOKENS, contrastRatio, clampScore, scoreBand };
      }
      if (specifier.startsWith("@/")) {
        const resolved = resolveCandidateFile(path.join(webRoot, specifier.slice(2)));
        if (resolved) {
          return compileAndRun(resolved);
        }
      }
      if (specifier.startsWith(".")) {
        const resolved = resolveCandidateFile(path.resolve(path.dirname(filePath), specifier));
        if (resolved) {
          const aliasKey = `@/${path.relative(webRoot, resolved).replace(/\\/g, "/").replace(/\.(tsx|ts|mjs)$/, "")}`;
          if (Object.hasOwn(mocks, aliasKey)) {
            return mocks[aliasKey];
          }
          return compileAndRun(resolved);
        }
      }
      return webRequire(specifier);
    };

    const fn = new Function("require", "module", "exports", outputText);
    fn(localRequire, moduleObj, moduleObj.exports);
    return moduleObj.exports;
  }

  return compileAndRun(path.join(webRoot, relPath));
}

function createInteractiveHarness(relPath, createMocks) {
  const states = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let hookIdx = 0;
  let pendingEffects = [];
  let currentProps = {};

  const depsEqual = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((item, idx) => Object.is(item, b[idx]));
  };

  const reactMock = {
    ...React,
    useId: () => "test-uid",
    useState: (initial) => {
      const idx = hookIdx++;
      if (!(idx in states)) {
        states[idx] = typeof initial === "function" ? initial() : initial;
      }
      const setState = (updater) => {
        states[idx] = typeof updater === "function" ? updater(states[idx]) : updater;
      };
      return [states[idx], setState];
    },
    useRef: (initial) => {
      const idx = hookIdx++;
      if (!(idx in refs)) {
        refs[idx] = { current: initial };
      }
      return refs[idx];
    },
    useCallback: (fn, deps) => {
      const idx = hookIdx++;
      const prev = callbacks[idx];
      if (!prev || !depsEqual(prev.deps, deps)) {
        callbacks[idx] = { fn, deps };
      }
      return callbacks[idx].fn;
    },
    useEffect: (effectFn, deps) => {
      const idx = hookIdx++;
      const prev = effects[idx];
      if (!prev || !deps || !depsEqual(prev.deps, deps)) {
        pendingEffects.push({ idx, effectFn, deps, prevCleanup: prev?.cleanup });
      }
    },
  };

  const mocks = createMocks(reactMock);
  const mod = loadPageModule(relPath, mocks);
  const Component = mod.default;

  function expandTree(node) {
    if (node === null || node === undefined || typeof node === "boolean") return null;
    if (typeof node === "string" || typeof node === "number") return node;
    if (Array.isArray(node)) return node.map(expandTree).flat();
    if (!React.isValidElement(node)) return node;

    if (node.type === React.Fragment) {
      return expandTree(node.props.children);
    }
    if (typeof node.type === "function") {
      return expandTree(node.type(node.props));
    }
    if (node.type && typeof node.type === "object" && typeof node.type.render === "function") {
      return expandTree(node.type.render(node.props, null));
    }
    return {
      type: node.type,
      props: {
        ...node.props,
        children: expandTree(node.props?.children),
      },
    };
  }

  function render(props = currentProps) {
    currentProps = props;
    hookIdx = 0;
    pendingEffects = [];
    const rootEl = Component(props);
    return expandTree(rootEl);
  }

  async function flushEffects() {
    const batch = pendingEffects.splice(0);
    for (const item of batch) {
      if (typeof item.prevCleanup === "function") {
        item.prevCleanup();
      }
      const cleanup = item.effectFn();
      effects[item.idx] = { deps: item.deps, cleanup };
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function unmount() {
    for (const item of effects) {
      if (item && typeof item.cleanup === "function") {
        item.cleanup();
      }
    }
  }

  function findAll(node, predicate, acc = []) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      node.forEach((child) => findAll(child, predicate, acc));
      return acc;
    }
    if (predicate(node)) acc.push(node);
    if (node.props?.children) findAll(node.props.children, predicate, acc);
    return acc;
  }

  function textOf(node) {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (node.props?.children) return textOf(node.props.children);
    return "";
  }

  return { render, flushEffects, unmount, findAll, textOf };
}

function createBaseMocks(overrides = {}) {
  return {
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...props }) =>
        React.createElement("a", { href, ...props }, children),
    },
    "next/navigation": {
      useRouter: () => ({ push: () => {} }),
      usePathname: () => "/",
    },
    "@/lib/api": {
      apiFetch: async () => ({}),
    },
    "@/store/auth-store": {
      useAuthStore: () => ({
        user: null,
        accessToken: null,
        hydrated: true,
        setSession: () => {},
        updateUser: () => {},
      }),
    },
    "@/components/providers": {
      useToast: () => ({ pushToast: () => {} }),
    },
    ...overrides,
  };
}

test("All 4 Task 5 route files avoid banned tokens, lucide-react, border-left stripes, uppercase, and Unicode emojis", () => {
  const files = [
    "app/page.tsx",
    "app/auth/login/page.tsx",
    "app/auth/register/page.tsx",
    "app/onboarding/page.tsx",
  ];

  for (const rel of files) {
    const src = fs.readFileSync(path.join(webRoot, rel), "utf8");
    assert.doesNotMatch(
      src,
      /\bbg-white\b|\btext-white\b|\btext-black\b|violet-|#7c3aed|amber-|zinc-|emerald-|rose-|indigo-|purple-|bg-brand|\bglass\b|shadow-violet|radial-gradient|data-preserve-white|lucide-react|\bborder-l(-|\b)/,
      `Banned token/class detected in ${rel}`,
    );
    assert.doesNotMatch(
      src,
      /[\u{1F300}-\u{1FAFF}\u2713\u25B3\u2192\u2197]/u,
      `Unicode emoji/arrow symbol detected in ${rel}`,
    );
    assert.doesNotMatch(src, /\buppercase\b/, `Gratuitous uppercase detected in ${rel}`);
  }
});

test("Landing page (/) renders asymmetric 60/40 hero without LCP MotionReveal, Sample ATS Match Dossier, 2x2 Bento, and demo login", async () => {
  const src = fs.readFileSync(path.join(webRoot, "app/page.tsx"), "utf8");
  assert.doesNotMatch(
    src,
    /<MotionReveal[^>]*>[\s\S]*<h1\b/,
    "Hero headline/CTA must NOT be wrapped in MotionReveal to avoid SSR opacity: 0 LCP delay",
  );
  assert.doesNotMatch(src, /lg:grid-cols-4/, "Must not use uniform 4-card SaaS icon grid");

  const { default: LandingPage } = loadPageModule("app/page.tsx", createBaseMocks());
  const html = renderToStaticMarkup(React.createElement(LandingPage));

  assert.match(html, /font-display/);
  assert.match(html, /clamp\(2\.25rem,4vw,3\.25rem\)/);
  assert.match(html, /max-w-\[54ch\]/);
  assert.match(html, /href="\/auth\/register"[^>]*>Get Started Free</);
  assert.match(html, /View Live Demo/);
  assert.match(html, /href="\/jobs"[^>]*>Explore Jobs</);

  // Sample ATS Match Dossier Bento module
  assert.match(html, /Sample ATS Match Dossier/);
  assert.match(html, /role="meter"/);
  assert.match(html, /aria-valuenow="91"/);
  assert.match(html, />91</);
  assert.match(html, />\/100</);
  assert.match(html, /54\/60/);
  assert.match(html, /23\/25/);
  assert.match(html, /14\/15/);
  assert.match(html, /Python/);
  assert.match(html, /FastAPI/);
  assert.match(html, /LLM/);
  assert.match(html, /RAG/);
  assert.match(html, /Missing: Kubernetes/);
  assert.match(html, /--status-warning-bg/);

  // Hydration-safe signed-in CTA: SSR & pre-mount render "Get Started Free", post-mount transitions to "Open Dashboard"
  const authedMocks = createBaseMocks({
    "@/store/auth-store": {
      useAuthStore: () => ({
        user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "user", onboarding_completed: true },
        setSession: () => {},
      }),
    },
  });
  const { default: AuthedLanding } = loadPageModule("app/page.tsx", authedMocks);
  const authedSsrHtml = renderToStaticMarkup(React.createElement(AuthedLanding));
  assert.match(authedSsrHtml, /href="\/auth\/register"[^>]*>Get Started Free</);
  assert.doesNotMatch(authedSsrHtml, /Open Dashboard/);

  const authedHarness = createInteractiveHarness("app/page.tsx", (reactMock) => ({
    ...authedMocks,
    react: reactMock,
    "framer-motion": {
      ...webRequire("framer-motion"),
      useReducedMotion: () => true,
    },
  }));
  const preMountTree = authedHarness.render();
  const preMountLink = authedHarness.findAll(
    preMountTree,
    (el) => el.type === "a" && authedHarness.textOf(el).includes("Get Started Free"),
  )[0];
  assert.ok(preMountLink, "Pre-mount render must match SSR CTA to prevent hydration mismatch");
  assert.equal(preMountLink.props.href, "/auth/register");

  await authedHarness.flushEffects();
  const postMountTree = authedHarness.render();
  const postMountLink = authedHarness.findAll(
    postMountTree,
    (el) => el.type === "a" && authedHarness.textOf(el).includes("Open Dashboard"),
  )[0];
  assert.ok(postMountLink, "Post-mount render for signed-in user must show Open Dashboard");
  assert.equal(postMountLink.props.href, "/dashboard");
  authedHarness.unmount();

  // Interactive demo launch preserves POST /auth/demo + setSession + /dashboard redirect
  const apiCalls = [];
  const sessions = [];
  const pushed = [];
  const toasts = [];
  const harness = createInteractiveHarness("app/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "framer-motion": {
        ...webRequire("framer-motion"),
        useReducedMotion: () => true,
      },
      "next/navigation": {
        useRouter: () => ({ push: (href) => pushed.push(href) }),
      },
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          return {
            access_token: "acc",
            refresh_token: "ref",
            token_type: "bearer",
            user: { id: 2, email: "demo@careerscout.ai", full_name: "Demo", role: "user", onboarding_completed: true },
          };
        },
      },
      "@/store/auth-store": {
        useAuthStore: () => ({
          user: null,
          setSession: (pair) => sessions.push(pair),
        }),
      },
      "@/components/providers": {
        useToast: () => ({ pushToast: (msg, kind) => toasts.push({ msg, kind }) }),
      },
    }),
  );

  const tree = harness.render();
  const demoBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("View Live Demo"),
  )[0];
  assert.ok(demoBtn);
  await demoBtn.props.onClick();
  assert.equal(apiCalls[0].pathName, "/auth/demo");
  assert.equal(apiCalls[0].opts.method, "POST");
  assert.equal(apiCalls[0].opts.skipAuth, true);
  assert.equal(sessions.length, 1);
  assert.equal(pushed[0], "/dashboard");
  assert.equal(toasts[0].kind, "success");
  harness.unmount();
});

test("Login (/auth/login) and Register (/auth/register) render Surface radius=3xl, label htmlFor, 44px aria-pressed Show/Hide, and role=alert errors", async () => {
  for (const [rel, expectedHeading, expectedFieldCount] of [
    ["app/auth/login/page.tsx", /Welcome back/, 2],
    ["app/auth/register/page.tsx", /Create your account/, 3],
  ]) {
    const { default: Page } = loadPageModule(rel, createBaseMocks());
    const html = renderToStaticMarkup(React.createElement(Page));

    assert.match(html, expectedHeading);
    assert.match(html, /rounded-3xl/);
    assert.match(html, /bg-surface/);
    assert.match(html, /border-hairline/);
    assert.match(html, /p-7 sm:p-8/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /min-h-\[44px\] min-w-\[44px\][^"]*sm:min-h-\[36px\]/);
    assert.match(html, />Show</);

    const fors = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(fors.length, expectedFieldCount, `Expected ${expectedFieldCount} label htmlFor bindings in ${rel}`);
    for (const id of fors) {
      assert.ok(html.includes(`id="${id}"`), `Expected matching control id="${id}" in ${rel}`);
    }
  }

  // Interactive Login: password toggle + failed POST /auth/login -> role=alert + demo login
  let loginFail = true;
  const loginCalls = [];
  const loginSessions = [];
  const loginRoutes = [];
  const loginHarness = createInteractiveHarness("app/auth/login/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: (href) => loginRoutes.push(href) }),
      },
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          loginCalls.push({ pathName, opts });
          if (pathName === "/auth/login" && loginFail) {
            throw new Error("Invalid email or password");
          }
          return {
            access_token: "acc",
            refresh_token: "ref",
            token_type: "bearer",
            user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "user", onboarding_completed: false },
          };
        },
      },
      "@/store/auth-store": {
        useAuthStore: () => ({
          setSession: (pair) => loginSessions.push(pair),
        }),
      },
    }),
  );

  let loginTree = loginHarness.render();
  const toggleBtn = loginHarness.findAll(
    loginTree,
    (el) => el.type === "button" && el.props?.["aria-pressed"] !== undefined,
  )[0];
  assert.equal(toggleBtn.props["aria-pressed"], false);
  toggleBtn.props.onClick();
  loginTree = loginHarness.render();
  const toggledBtn = loginHarness.findAll(
    loginTree,
    (el) => el.type === "button" && el.props?.["aria-pressed"] !== undefined,
  )[0];
  assert.equal(toggledBtn.props["aria-pressed"], true);
  assert.equal(loginHarness.textOf(toggledBtn), "Hide");
  const pwInput = loginHarness.findAll(
    loginTree,
    (el) => el.type === "input" && el.props?.id === "login-password",
  )[0];
  assert.equal(pwInput.props.type, "text");

  const emailInput = loginHarness.findAll(
    loginTree,
    (el) => el.type === "input" && el.props?.type === "email",
  )[0];
  emailInput.props.onChange({ target: { value: "ada@example.com" } });
  pwInput.props.onChange({ target: { value: "secret123" } });
  loginTree = loginHarness.render();
  await loginHarness.findAll(loginTree, (el) => el.type === "form")[0].props.onSubmit({
    preventDefault: () => {},
  });
  loginTree = loginHarness.render();
  const loginAlerts = loginHarness.findAll(loginTree, (el) => el.props?.role === "alert");
  assert.equal(loginAlerts.length, 1);
  assert.match(loginHarness.textOf(loginAlerts[0]), /Invalid email or password/);

  loginFail = false;
  await loginHarness.findAll(loginTree, (el) => el.type === "form")[0].props.onSubmit({
    preventDefault: () => {},
  });
  assert.equal(loginSessions.length, 1);
  assert.equal(loginRoutes[0], "/onboarding");
  loginHarness.unmount();

  // Interactive Register: <8 char validation -> role=alert; valid submit -> POST /auth/register -> /onboarding
  const regRoutes = [];
  const regSessions = [];
  const regHarness = createInteractiveHarness("app/auth/register/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: (href) => regRoutes.push(href) }),
      },
      "@/lib/api": {
        apiFetch: async () => ({
          access_token: "acc",
          refresh_token: "ref",
          token_type: "bearer",
          user: { id: 3, email: "new@example.com", full_name: "New", role: "user", onboarding_completed: false },
        }),
      },
      "@/store/auth-store": {
        useAuthStore: () => ({
          setSession: (pair) => regSessions.push(pair),
        }),
      },
    }),
  );

  let regTree = regHarness.render();
  const regInputs = regHarness.findAll(regTree, (el) => el.type === "input");
  regInputs[0].props.onChange({ target: { value: "Alex Moreau" } });
  regInputs[1].props.onChange({ target: { value: "alex@company.com" } });
  regInputs[2].props.onChange({ target: { value: "short" } });
  regTree = regHarness.render();
  await regHarness.findAll(regTree, (el) => el.type === "form")[0].props.onSubmit({
    preventDefault: () => {},
  });
  regTree = regHarness.render();
  const regAlerts = regHarness.findAll(regTree, (el) => el.props?.role === "alert");
  assert.equal(regAlerts.length, 1);
  assert.match(regHarness.textOf(regAlerts[0]), /at least 8 characters/);

  regHarness.findAll(regTree, (el) => el.type === "input")[2].props.onChange({
    target: { value: "validpass123" },
  });
  regTree = regHarness.render();
  await regHarness.findAll(regTree, (el) => el.type === "form")[0].props.onSubmit({
    preventDefault: () => {},
  });
  assert.equal(regSessions.length, 1);
  assert.equal(regRoutes[0], "/onboarding");
  regHarness.unmount();
});

test("Onboarding (/onboarding) renders min-h-[44px] step controls, accessible CV file trigger, role=alert errors, and preserves handleFinish flow", async () => {
  const src = fs.readFileSync(path.join(webRoot, "app/onboarding/page.tsx"), "utf8");
  assert.doesNotMatch(src, /h-2\.5 w-10/, "Old 10px step bar must be removed");

  const authedMocks = createBaseMocks({
    "@/store/auth-store": {
      useAuthStore: () => ({
        accessToken: "tok",
        hydrated: true,
        user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "user", onboarding_completed: false },
        setSession: () => {},
        updateUser: () => {},
      }),
    },
  });

  const { default: OnboardingPage } = loadPageModule("app/onboarding/page.tsx", authedMocks);
  const html = renderToStaticMarkup(React.createElement(OnboardingPage));
  assert.match(html, /1\. Profile/);
  assert.match(html, /2\. Stack &amp; Preferences/);
  assert.match(html, /3\. CV Upload/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /min-h-\[44px\]/);

  const step1Fors = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(step1Fors.length >= 6);
  for (const id of step1Fors) {
    assert.ok(html.includes(`id="${id}"`), `Expected matching control id="${id}" on onboarding step 1`);
  }

  // Interactive multi-step flow + profile error + CV upload/paste isolation + handleFinish
  let failProfile = true;
  let failFileUpload = true;
  const apiCalls = [];
  const updatedUsers = [];
  const routes = [];
  const harness = createInteractiveHarness("app/onboarding/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: (href) => routes.push(href) }),
      },
      "@/store/auth-store": {
        useAuthStore: () => ({
          accessToken: "tok",
          hydrated: true,
          user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "user", onboarding_completed: false },
          setSession: () => {},
          updateUser: (patch) => updatedUsers.push(patch),
        }),
      },
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/profile") {
            if (failProfile) throw new Error("Profile service temporarily offline");
            return {
              headline: "Staff ML Engineer",
              country: "France",
              preferred_countries: ["France"],
              cities: ["Paris"],
              experience_level: "senior",
              years_experience: 6,
              preferred_roles: ["ML Engineer"],
              technologies: ["Python", "PyTorch"],
              languages: ["English", "French"],
              salary_expectation: "85k EUR",
              remote_preference: "hybrid",
              visa_required: false,
            };
          }
          if (pathName === "/cvs/upload") {
            if (failFileUpload) {
              throw new Error("Corrupted PDF file");
            }
            return {
              id: 10,
              filename: "very-long-unbreakable-resume-filename-without-spaces-2026.pdf",
              mime_type: "application/pdf",
              file_size: 420,
              is_primary: true,
              encrypted: true,
              created_at: "2026-11-11T12:00:00Z",
              parsed: {
                summary: "AI Engineer",
                skills: ["Docker"],
                languages: ["Spanish"],
                years_experience: 6,
                experience_level: "senior",
                suggested_roles: ["AI Engineer"],
              },
            };
          }
          if (pathName === "/cvs/from-text") {
            return {
              id: 11,
              filename: "onboarding-cv.txt",
              mime_type: "text/plain",
              file_size: 120,
              is_primary: true,
              encrypted: true,
              created_at: "2026-11-11T12:00:00Z",
              parsed: {
                summary: "ML Engineer",
                skills: ["FastAPI", "RAG"],
                languages: ["German"],
                years_experience: 7,
                experience_level: "senior",
                suggested_roles: ["AI Engineer"],
              },
            };
          }
          if (pathName === "/profile/complete-onboarding") {
            return { ok: true };
          }
          return {};
        },
      },
    }),
  );

  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  const profileAlerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(profileAlerts.length, 1);
  assert.match(harness.textOf(profileAlerts[0]), /Profile service temporarily offline/);

  // Retry profile fetch
  failProfile = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  assert.ok(retryBtn);
  await retryBtn.props.onClick();
  tree = harness.render();
  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 0);

  // Navigate to Step 3 (CV Upload)
  const step3Btn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("3. CV Upload"),
  )[0];
  assert.ok(step3Btn);
  assert.match(step3Btn.props.className, /min-h-\[44px\]/);
  step3Btn.props.onClick();
  tree = harness.render();

  const fileInput = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "file",
  )[0];
  assert.ok(fileInput);
  assert.match(fileInput.props.className, /\bsr-only\b/);
  assert.equal(fileInput.props.disabled, false);
  const dropZone = harness.findAll(
    tree,
    (el) => typeof el.props?.className === "string" && el.props.className.includes("focus-within:ring-2"),
  )[0];
  assert.ok(dropZone);
  const uploadTrigger = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Choose CV File"),
  )[0];
  assert.ok(uploadTrigger);

  // 1. Failed file upload clears cvFile, resets input.value, and shows role=alert
  const mockFile = new File(["pdf bytes"], "very-long-unbreakable-resume-filename-without-spaces-2026.pdf", {
    type: "application/pdf",
  });
  const fileTarget = { files: [mockFile], value: "C:\\fakepath\\resume.pdf" };
  await fileInput.props.onChange({ target: fileTarget });
  assert.equal(fileTarget.value, "", "File input value must reset so selecting the same file again fires onChange");
  tree = harness.render();
  assert.doesNotMatch(harness.textOf(tree), /Selected:/, "Failed upload must clear stale cvFile");
  assert.match(harness.textOf(harness.findAll(tree, (el) => el.props?.role === "alert")[0]), /Corrupted PDF file/);

  // 2. Successful file upload displays break-all filename and merges parsed languages
  failFileUpload = false;
  await fileInput.props.onChange({ target: { files: [mockFile], value: "C:\\fakepath\\resume.pdf" } });
  tree = harness.render();
  assert.match(harness.textOf(tree), /Selected:\s*very-long-unbreakable-resume-filename-without-spaces-2026\.pdf/);
  const breakAllSelected = harness.findAll(
    tree,
    (el) => el.type === "p" && typeof el.props?.className === "string" && el.props.className.includes("break-all") && harness.textOf(el).includes("Selected:"),
  )[0];
  assert.ok(breakAllSelected, "Selected filename must use break-all wrapping for 390px safety");
  const breakAllParsed = harness.findAll(
    tree,
    (el) => el.type === "p" && typeof el.props?.className === "string" && el.props.className.includes("break-all") && harness.textOf(el).includes("Parsed "),
  )[0];
  assert.ok(breakAllParsed, "Parsed filename must use break-all wrapping for 390px safety");
  assert.ok(
    harness.findAll(tree, (el) => el.type === "button" && harness.textOf(el).includes("Clear file"))[0],
    "Clear file control must be rendered when cvFile is active",
  );

  // 3. Short (<15 char) pasted text shows role=alert without calling /cvs/from-text
  const fromTextBeforeShort = apiCalls.filter((c) => c.pathName === "/cvs/from-text").length;
  harness.findAll(tree, (el) => el.type === "textarea")[0].props.onChange({ target: { value: "Too short" } });
  tree = harness.render();
  assert.doesNotMatch(harness.textOf(tree), /Selected:/, "Typing pasted CV text clears previous cvFile selection");
  const parseBtnShort = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Parse Pasted CV Now"),
  )[0];
  assert.ok(parseBtnShort);
  await parseBtnShort.props.onClick();
  tree = harness.render();
  assert.equal(apiCalls.filter((c) => c.pathName === "/cvs/from-text").length, fromTextBeforeShort);
  assert.match(harness.textOf(harness.findAll(tree, (el) => el.props?.role === "alert")[0]), /at least 15 characters/);

  // 4. "Parse Pasted CV Now" invokes /cvs/from-text (never /cvs/upload) and clears cvFile
  const uploadCallsBeforePaste = apiCalls.filter((c) => c.pathName === "/cvs/upload").length;
  harness.findAll(tree, (el) => el.type === "textarea")[0].props.onChange({
    target: { value: "Senior AI Engineer experienced in FastAPI, RAG, and production systems." },
  });
  tree = harness.render();
  const parseBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Parse Pasted CV Now"),
  )[0];
  await parseBtn.props.onClick();
  tree = harness.render();
  assert.equal(apiCalls.filter((c) => c.pathName === "/cvs/upload").length, uploadCallsBeforePaste);
  assert.equal(apiCalls.filter((c) => c.pathName === "/cvs/from-text").length, 1);
  assert.match(harness.textOf(tree), /Parsed onboarding-cv\.txt/);

  // 5. Editing pasted CV text invalidates parsedPreview so handleFinish auto-parses via /cvs/from-text + completes onboarding
  harness.findAll(tree, (el) => el.type === "textarea")[0].props.onChange({
    target: { value: "Senior ML Engineer with FastAPI and RAG." },
  });
  tree = harness.render();
  assert.doesNotMatch(harness.textOf(tree), /Parsed onboarding-cv\.txt/, "Editing cvText must clear stale parsedPreview");

  const finishBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Finish & Open Dashboard"),
  )[0];
  assert.ok(finishBtn);
  await finishBtn.props.onClick();

  const fromTextCalls = apiCalls.filter((c) => c.pathName === "/cvs/from-text");
  const completeCall = apiCalls.find((c) => c.pathName === "/profile/complete-onboarding");
  assert.equal(fromTextCalls.length, 2, "handleFinish must auto-parse edited pasted CV via /cvs/from-text");
  assert.ok(completeCall, "handleFinish must POST /profile/complete-onboarding");
  const completePayload = JSON.parse(completeCall.opts.body);
  assert.ok(completePayload.technologies.includes("FastAPI"));
  assert.ok(completePayload.technologies.includes("RAG"));
  assert.equal(completePayload.years_experience, 7);
  assert.ok(completePayload.languages.includes("Spanish"), "File upload parsed languages must be preserved");
  assert.ok(completePayload.languages.includes("German"), "Pasted CV parsed languages must be merged");
  assert.deepEqual(updatedUsers, [{ onboarding_completed: true }]);
  assert.equal(routes[0], "/dashboard");

  harness.unmount();
});
