import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  LIGHT_TOKENS,
  DARK_TOKENS,
  contrastRatio,
  clampScore,
  scoreBand,
} from "../lib/theme-tokens.mjs";

const webRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(webRoot, "../..");
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
          const aliasKey = `@/${path
            .relative(webRoot, resolved)
            .replace(/\\/g, "/")
            .replace(/\.(tsx|ts|mjs)$/, "")}`;
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

    if (node.type === React.Fragment || node.type === React.Suspense) {
      return expandTree(node.props.children);
    }
    if (typeof node.type === "function") {
      return expandTree(node.type(node.props));
    }
    if (node.type && typeof node.type === "object" && typeof node.type.render === "function") {
      return expandTree(node.type.render(node.props, null));
    }
    const elRef = node.ref ?? node.props?.ref ?? null;
    return {
      type: node.type,
      ref: elRef,
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

  async function flushEffects(waitMs = 0) {
    const batch = pendingEffects.splice(0);
    for (const item of batch) {
      if (typeof item.prevCleanup === "function") {
        item.prevCleanup();
      }
      const cleanup = item.effectFn();
      effects[item.idx] = { deps: item.deps, cleanup };
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
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

class MockApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
      usePathname: () => "/cvs",
      useSearchParams: () => new URLSearchParams(),
      useParams: () => ({}),
    },
    "@/lib/api": {
      ApiError: MockApiError,
      apiFetch: async () => ({}),
      downloadWithAuth: async () => {},
    },
    "@/store/auth-store": {
      useAuthStore: () => ({
        user: {
          id: 1,
          email: "ada@example.com",
          full_name: "Ada Lovelace",
          role: "admin",
          onboarding_completed: true,
        },
        accessToken: "tok",
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function findPythonExecutable() {
  const candidates = [
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, ".local", "bin", "python3.12.exe")
      : null,
    "python3",
    "python",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
      continue;
    }
    try {
      execFileSync(candidate, ["-c", "import sys"], { stdio: "pipe" });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("Could not find a working Python interpreter to verify emailer.py");
}

function makeCv(overrides = {}) {
  return {
    id: 1,
    filename: "very-long-unbreakable-ada-lovelace-staff-ai-engineer-cv-2026.pdf",
    mime_type: "application/pdf",
    file_size: 40960,
    is_primary: true,
    encrypted: true,
    created_at: "2026-11-11T10:00:00Z",
    parsed: {
      summary: "Staff AI engineer specializing in RAG pipelines and distributed Python APIs.",
      skills: ["Python", "FastAPI", "RAG", "Docker"],
      languages: ["English", "French"],
      years_experience: 7,
      experience_level: "senior",
      suggested_roles: ["AI Engineer"],
    },
    ...overrides,
  };
}

test("All 7 Task 7 route files and emailer.py remove Sidebar, banned tokens, dark: leftovers, emojis, and uniform KPI grids", () => {
  const routeFiles = [
    "app/cvs/page.tsx",
    "app/ai-insights/page.tsx",
    "app/ai-chat/page.tsx",
    "app/analytics/page.tsx",
    "app/email-settings/page.tsx",
    "app/profile-settings/page.tsx",
    "app/admin/page.tsx",
  ];

  for (const rel of routeFiles) {
    const src = fs.readFileSync(path.join(webRoot, rel), "utf8");
    assert.doesNotMatch(
      src,
      /@\/components\/sidebar/,
      `Sidebar import must be removed from ${rel}`,
    );
    assert.doesNotMatch(src, /<Sidebar\b/, `<Sidebar /> usage must be removed from ${rel}`);
    assert.doesNotMatch(
      src,
      /<div className="flex gap-6">/,
      `Legacy sidebar shell must be removed from ${rel}`,
    );
    assert.doesNotMatch(
      src,
      /\bbg-white\b|\btext-white\b|\btext-black\b|\bdark:|violet-|#7c3aed|#a78bfa|amber-|zinc-|emerald-|rose-|indigo-|purple-|bg-brand|\bglass\b|shadow-violet|radial-gradient|data-preserve-white|lucide-react|\bborder-l(-|\b)|\buppercase\b/,
      `Banned token/class detected in ${rel}`,
    );
    assert.doesNotMatch(
      src,
      /[\u{1F300}-\u{1FAFF}\u2713\u25B3\u2192\u2197]/u,
      `Unicode emoji/arrow symbol detected in ${rel}`,
    );
  }

  for (const kpiBanRoute of [
    "app/ai-insights/page.tsx",
    "app/analytics/page.tsx",
    "app/admin/page.tsx",
  ]) {
    const src = fs.readFileSync(path.join(webRoot, kpiBanRoute), "utf8");
    assert.doesNotMatch(
      src,
      /lg:grid-cols-4/,
      `${kpiBanRoute} must retire uniform 4-card KPI grid`,
    );
    assert.doesNotMatch(
      src,
      /\bmd:grid-cols-3\b/,
      `${kpiBanRoute} must retire uniform 3-card KPI grid`,
    );
  }

  const emailerSrc = fs.readFileSync(
    path.join(repoRoot, "apps/api/app/services/emailer.py"),
    "utf8",
  );
  assert.doesNotMatch(
    emailerSrc,
    /Inter|Roboto|Arial|#09090b|#7c3aed|#a78bfa|#111113|#27272a|#d4d4d8|#a1a1aa|text-transform:\s*uppercase/i,
    "emailer.py must remove legacy dark/violet/Inter/Arial/uppercase styling",
  );
  for (const token of [
    "#F3F1EC",
    "#FCFBF8",
    "#E2DFD6",
    "#1B201C",
    "#2D6A4F",
    "#FFFFFF",
    "Plus Jakarta Sans",
  ]) {
    assert.ok(emailerSrc.includes(token), `emailer.py must include Option 3 token ${token}`);
  }
  assert.match(emailerSrc, /async def dispatch_email_digest\(/);
});

test("CV Manager (/cvs) fixes P0 keyboard upload, locks paste & per-CV actions, binds labels, wraps filenames, and shows error+Retry", async () => {
  let failList = true;
  let cvItems = [
    makeCv({ id: 1, is_primary: true }),
    makeCv({
      id: 2,
      filename: "secondary-ml-resume-with-very-long-unbroken-filename.docx",
      is_primary: false,
      encrypted: true,
    }),
  ];
  const uploadDeferred = createDeferred();
  const primaryDeferred = createDeferred();
  const deleteDeferred = createDeferred();
  const apiCalls = [];

  const harness = createInteractiveHarness("app/cvs/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/lib/api": {
        ApiError: MockApiError,
        downloadWithAuth: async () => {},
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/cvs") {
            if (failList) throw new Error("CV vault unavailable");
            return { items: cvItems };
          }
          if (pathName === "/cvs/upload") {
            return uploadDeferred.promise;
          }
          if (pathName === "/cvs/from-text") {
            return { id: 3 };
          }
          if (pathName === "/cvs/2/primary") {
            return primaryDeferred.promise;
          }
          if (pathName === "/cvs/2") {
            return deleteDeferred.promise;
          }
          if (pathName === "/cvs/1/parsed") {
            return { status: "updated" };
          }
          return {};
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  // Error renders SectionState role=alert + Retry (not empty state)
  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /CV vault unavailable/);
  assert.doesNotMatch(harness.textOf(tree), /No CVs uploaded yet/);

  // Retry succeeds
  failList = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();
  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 0);

  // P0 Keyboard upload fix: real button trigger + sr-only tabIndex=-1 file input
  const fileInput = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "file",
  )[0];
  assert.ok(fileInput);
  assert.match(fileInput.props.className, /\bsr-only\b/);
  assert.doesNotMatch(fileInput.props.className, /\bhidden\b/);
  assert.equal(fileInput.props.tabIndex, -1);

  const uploadBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Choose File"),
  )[0];
  assert.ok(uploadBtn, "Must render a real <button type='button'> upload trigger");
  assert.match(uploadBtn.props.className, /min-h-\[44px\]/);
  assert.match(uploadBtn.props.className, /focus-visible:ring-2/);

  let inputClicked = false;
  assert.ok(fileInput.ref, "File input must attach fileInputRef");
  fileInput.ref.current = {
    click: () => {
      inputClicked = true;
    },
  };
  uploadBtn.props.onClick();
  assert.equal(
    inputClicked,
    true,
    "Clicking upload trigger button must invoke fileInputRef.current.click()",
  );

  // No <label> wrapping <input type="file">
  const labelsWithFileInput = harness.findAll(
    tree,
    (el) =>
      el.type === "label" &&
      harness.findAll(el, (child) => child.type === "input" && child.props?.type === "file")
        .length > 0,
  );
  assert.equal(labelsWithFileInput.length, 0, "File input must NOT be wrapped inside <label>");

  // Sculpted Bento CV cards with semantic Badges and break-words filename
  const text = harness.textOf(tree);
  assert.match(text, /Active Primary/);
  assert.match(text, /Encrypted/);
  const cvFilenameH2 = harness.findAll(
    tree,
    (el) => el.type === "h2" && harness.textOf(el).includes("very-long-unbreakable-ada-lovelace"),
  )[0];
  assert.ok(cvFilenameH2);
  assert.match(cvFilenameH2.props.className, /\bbreak-words\b/);
  assert.match(cvFilenameH2.props.className, /\bmin-w-0\b/);

  // Open paste mode & start upload -> paste inputs must disable while uploading is in flight
  const pasteToggle = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Paste CV Text"),
  )[0];
  pasteToggle.props.onClick();
  tree = harness.render();

  const mockFile = new File(["cv bytes"], "new-resume.pdf", { type: "application/pdf" });
  const fileTarget = { files: [mockFile], value: "C:\\fakepath\\new-resume.pdf" };
  const uploadPromise = fileInput.props.onChange({ target: fileTarget });
  assert.equal(fileTarget.value, "", "File input value must reset after picking a file");
  tree = harness.render();

  const pasteInputsDuringUpload = harness.findAll(
    tree,
    (el) => (el.type === "input" && el.props?.type !== "file") || el.type === "textarea",
  );
  assert.ok(pasteInputsDuringUpload.length >= 2);
  for (const ctrl of pasteInputsDuringUpload) {
    assert.equal(
      ctrl.props.disabled,
      true,
      "Paste inputs must be disabled while upload is in flight",
    );
  }

  uploadDeferred.resolve({ id: 3 });
  await uploadPromise;
  tree = harness.render();

  // Verify label htmlFor bindings in paste mode
  for (const lbl of harness.findAll(tree, (el) => el.type === "label")) {
    assert.ok(lbl.props?.htmlFor, "Every <label> on /cvs must specify htmlFor");
    assert.ok(
      harness.findAll(tree, (el) => el.props?.id === lbl.props.htmlFor)[0],
      `Expected control with id="${lbl.props.htmlFor}"`,
    );
  }

  // Per-CV busy locking: click Set Primary on CV #2 locks CV #2 while leaving CV #1 interactive
  const setPrimaryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Set Primary"),
  )[0];
  const primaryPromise = setPrimaryBtn.props.onClick();
  tree = harness.render();

  const articles = harness.findAll(tree, (el) => el.type === "article");
  assert.equal(articles.length, 2);
  const cv1EditBtn = harness.findAll(
    articles[0],
    (el) => el.type === "button" && harness.textOf(el) === "Edit Skills",
  )[0];
  const cv2DeleteBtn = harness.findAll(
    articles[1],
    (el) => el.type === "button" && harness.textOf(el) === "Delete",
  )[0];
  assert.equal(
    cv1EditBtn.props.disabled,
    false,
    "CV #1 must remain interactive while CV #2 is busy",
  );
  assert.equal(cv2DeleteBtn.props.disabled, true, "CV #2 actions must lock while CV #2 is busy");

  // Rapid duplicate click while CV #2 is busy must not dispatch Delete
  await cv2DeleteBtn.props.onClick();
  assert.equal(
    apiCalls.filter((c) => c.pathName === "/cvs/2" && c.opts?.method === "DELETE").length,
    0,
  );

  cvItems = cvItems.map((item) => ({ ...item, is_primary: item.id === 2 }));
  primaryDeferred.resolve({ status: "updated", primary_cv_id: 2 });
  await primaryPromise;
  tree = harness.render();

  // Edit Skills on CV #1: verify bound labels and PATCH /cvs/1/parsed
  const editSkillsBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Edit Skills",
  )[0];
  editSkillsBtn.props.onClick();
  tree = harness.render();

  for (const lbl of harness.findAll(tree, (el) => el.type === "label")) {
    assert.ok(lbl.props?.htmlFor);
    assert.ok(harness.findAll(tree, (el) => el.props?.id === lbl.props.htmlFor)[0]);
  }
  const saveRescoreBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Save & Re-score"),
  )[0];
  await saveRescoreBtn.props.onClick();
  assert.ok(apiCalls.some((c) => c.pathName === "/cvs/1/parsed" && c.opts?.method === "PATCH"));

  // Delete CV #2
  const deleteBtn2 = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Delete",
  )[1];
  const delPromise = deleteBtn2.props.onClick();
  cvItems = [cvItems[0]];
  deleteDeferred.resolve({ status: "deleted" });
  await delPromise;
  tree = harness.render();
  assert.equal(harness.findAll(tree, (el) => el.type === "article").length, 1);

  harness.unmount();
});

test("AI Insights (/ai-insights) renders asymmetric Bento pair, ScoreRing, inline SVG arrows, bar modules, and error+Retry", async () => {
  let failInsights = true;
  const insightsPayload = {
    ats_readiness_score: 84,
    jobs_analyzed: 42,
    cv_skills_count: 14,
    top_missing_skills: [
      { skill: "Kubernetes", demand_count: 18, impact: 11 },
      { skill: "Terraform", demand_count: 10, impact: 6 },
    ],
    top_strengths: [
      { skill: "Python", matched_count: 35 },
      { skill: "FastAPI", matched_count: 24 },
    ],
    market_skill_demand: [
      { skill: "Python", demand_count: 38, in_cv: true },
      { skill: "Kubernetes", demand_count: 18, in_cv: false },
    ],
    recommendations: [
      "Add Kubernetes deployment metrics to your primary CV summary.",
      "Highlight production RAG latency benchmarks for Staff AI roles.",
    ],
  };

  const harness = createInteractiveHarness("app/ai-insights/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/lib/api": {
        ApiError: MockApiError,
        apiFetch: async (pathName) => {
          if (pathName === "/matches/insights") {
            if (failInsights) throw new Error("Insights engine offline");
            return insightsPayload;
          }
          return {};
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /Insights engine offline/);

  failInsights = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  const text = harness.textOf(tree);
  assert.match(text, /Market ATS Readiness/);
  assert.match(text, /Profile Coverage & Strategic Recommendations/);
  assert.match(text, /Top Missing Skills by Impact/);
  assert.match(text, /Top Market Demand vs Your Coverage/);
  assert.match(text, /84/);
  assert.match(text, /Kubernetes/);
  assert.match(text, /\+11% potential boost/);

  const meters = harness.findAll(tree, (el) => el.props?.role === "meter");
  assert.equal(meters.length, 1);
  assert.equal(meters[0].props["aria-valuenow"], 84);

  const coachLink = harness.findAll(
    tree,
    (el) => el.type === "a" && el.props?.href === "/ai-chat",
  )[0];
  assert.ok(coachLink);
  assert.doesNotMatch(harness.textOf(coachLink), /→/);

  harness.unmount();
});

test("AI Chat (/ai-chat) renders centered Botanical studio wrapper around AuthGate and AIChatPanel", () => {
  const { default: AIChatPage } = loadPageModule("app/ai-chat/page.tsx", createBaseMocks());
  const html = renderToStaticMarkup(React.createElement(AIChatPage));

  assert.match(html, /font-display/);
  assert.match(html, /max-w-4xl/);
  assert.match(html, /AI Chat Assistant/);
  assert.match(html, /AI Career Assistant/);
  assert.doesNotMatch(html, /text-white/);
});

test("Analytics (/analytics) renders hairline region strip, distribution bars, Funnel & Work Mode Bento stones, and error+Retry", async () => {
  let failAnalytics = true;
  const analyticsPayload = {
    kpis: {
      total_jobs: 164,
      jobs_last_24h: 19,
      average_match_score: 79,
      high_match_jobs: 28,
      saved_count: 6,
      applied_count: 3,
      digests_sent: 4,
    },
    score_distribution: [
      { bucket: "80-100", count: 28 },
      { bucket: "60-79", count: 64 },
    ],
    jobs_by_source: [
      { source: "greenhouse", count: 72 },
      { source: "ashby", count: 44 },
    ],
    jobs_by_remote_mode: [
      { mode: "remote", count: 80 },
      { mode: "hybrid", count: 60 },
      { mode: "onsite", count: 24 },
    ],
    top_market_skills: [
      { skill: "Python", count: 112, matched: true },
      { skill: "Kubernetes", count: 55, matched: false },
    ],
    application_funnel: [
      { stage: "saved", count: 6 },
      { stage: "applied", count: 3 },
      { stage: "interviewing", count: 1 },
      { stage: "offer", count: 0 },
      { stage: "rejected", count: 0 },
    ],
  };

  const harness = createInteractiveHarness("app/analytics/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/lib/api": {
        ApiError: MockApiError,
        apiFetch: async () => {
          if (failAnalytics) throw new Error("Analytics warehouse down");
          return analyticsPayload;
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 1);

  failAnalytics = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  const region = harness.findAll(tree, (el) => el.props?.role === "region")[0];
  assert.ok(region, "Analytics telemetry strip must expose role='region'");
  const regionText = harness.textOf(region);
  assert.match(regionText, /164/);
  assert.match(regionText, /79\/100/);
  assert.match(regionText, /28/);
  assert.match(regionText, /4/);

  const fullText = harness.textOf(tree);
  assert.match(fullText, /Match Score Distribution/);
  assert.match(fullText, /Jobs by Source/);
  assert.match(fullText, /Application Funnel/);
  assert.match(fullText, /Work Mode Split/);

  const subtleWells = harness.findAll(
    tree,
    (el) => typeof el.props?.className === "string" && el.props.className.includes("bg-subtle"),
  );
  assert.ok(
    subtleWells.length >= 8,
    "Funnel and Work Mode stones should use --bg-subtle inner wells",
  );

  harness.unmount();
});

test("Admin (/admin) surfaces 403 & generic errors via SectionState with Retry, hairline status strip, sources, and runs table", async () => {
  let mode = "forbidden";
  const apiCalls = [];
  const adminPayload = {
    services: {
      api: { status: "ok" },
      database: { status: "ok", dialect: "postgresql" },
      ai_engine: { status: "ok", llm_mode: "gemini-2.5" },
      redis: { status: "ok", queue_depth: 2 },
    },
    metrics: {
      total_jobs: 210,
      total_users: 14,
      recent_failures: 0,
    },
    sources: [
      { id: "gh", name: "Greenhouse", type: "ats", requires_key: false, configured: true },
      { id: "li", name: "Partner API", type: "api", requires_key: true, configured: false },
    ],
    recent_runs: [
      {
        id: 1,
        source: "greenhouse",
        backend: "httpx",
        status: "success",
        jobs_fetched: 42,
        jobs_upserted: 18,
        duration_ms: 820,
        error_message: "",
        started_at: "2026-11-11T09:00:00Z",
      },
    ],
  };

  const harness = createInteractiveHarness("app/admin/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/lib/api": {
        ApiError: MockApiError,
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/admin/status") {
            if (mode === "forbidden") throw new MockApiError("Forbidden", 403);
            if (mode === "error") throw new Error("Admin telemetry timeout");
            return adminPayload;
          }
          if (pathName === "/admin/scrape") {
            return { total_ingested: 15 };
          }
          return {};
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  const alert403 = harness.findAll(tree, (el) => el.props?.role === "alert")[0];
  assert.ok(alert403);
  assert.match(harness.textOf(alert403), /Admin role is required/);
  assert.ok(
    harness.findAll(tree, (el) => el.type === "button" && harness.textOf(el).includes("Retry"))[0],
  );

  // Generic error also surfaces in SectionState + Retry
  mode = "error";
  await harness
    .findAll(tree, (el) => el.type === "button" && harness.textOf(el).includes("Retry"))[0]
    .props.onClick();
  tree = harness.render();
  assert.match(
    harness.textOf(harness.findAll(tree, (el) => el.props?.role === "alert")[0]),
    /Admin telemetry timeout/,
  );

  // Recover on 200
  mode = "ok";
  await harness
    .findAll(tree, (el) => el.type === "button" && harness.textOf(el).includes("Retry"))[0]
    .props.onClick();
  tree = harness.render();

  const healthRegion = harness.findAll(tree, (el) => el.props?.role === "region")[0];
  assert.ok(healthRegion);
  assert.match(harness.textOf(healthRegion), /API & DB/);
  assert.match(harness.textOf(healthRegion), /AI Engine/);
  assert.match(harness.textOf(healthRegion), /Redis Queue/);
  assert.match(harness.textOf(healthRegion), /210 \/ 14/);

  const tableWrapper = harness.findAll(
    tree,
    (el) =>
      typeof el.props?.className === "string" && el.props.className.includes("overflow-x-auto"),
  )[0];
  assert.ok(tableWrapper);
  const tableEl = harness.findAll(tree, (el) => el.type === "table")[0];
  assert.ok(tableEl);
  assert.match(harness.textOf(tree), /820 ms/);

  const scrapeBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Trigger Multi-Source Scrape"),
  )[0];
  await scrapeBtn.props.onClick();
  assert.ok(apiCalls.some((c) => c.pathName === "/admin/scrape" && c.opts?.method === "POST"));

  harness.unmount();
});

test("Email Settings (/email-settings) handles error+Retry, stale cancellation, bound 8 controls, framed iframe, and logs table", async () => {
  let failLoad = true;
  let slowMode = false;
  let currentToken = "tok-1";
  const slowDeferred = createDeferred();
  const slowSignals = [];
  const apiCalls = [];

  const settingsFixture = {
    digest_enabled: true,
    frequency: "weekdays",
    send_hour: 8,
    timezone: "Europe/Paris",
    min_match_score: 75,
    max_jobs_per_email: 10,
    subject_template: "Daily Top Matches",
    recipient_email: "ada@example.com",
    last_sent_at: null,
    updated_at: null,
  };
  const logsFixture = [
    {
      id: 1,
      recipient_email: "ada@example.com",
      subject: "Daily Top Matches",
      job_count: 5,
      status: "sent",
      provider: "local_preview",
      error_message: "",
      sent_at: "2026-11-11T08:00:00Z",
    },
  ];
  const previewFixture = "<div>Preview OK</div>";

  const harness = createInteractiveHarness("app/email-settings/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/store/auth-store": {
        useAuthStore: () => ({
          user: {
            id: 1,
            email: "ada@example.com",
            full_name: "Ada Lovelace",
            role: "admin",
            onboarding_completed: true,
          },
          accessToken: currentToken,
          hydrated: true,
          setSession: () => {},
          updateUser: () => {},
        }),
      },
      "@/lib/api": {
        ApiError: MockApiError,
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/email-settings" && (!opts?.method || opts.method === "GET")) {
            if (slowMode) {
              slowSignals.push(opts?.signal);
              return slowDeferred.promise;
            }
            if (failLoad) throw new Error("Email settings API offline");
            return settingsFixture;
          }
          if (pathName === "/email-settings/logs") {
            return { items: logsFixture };
          }
          if (pathName === "/email-settings/preview") {
            return { html: previewFixture };
          }
          if (pathName === "/email-settings" && opts?.method === "PUT") {
            return JSON.parse(opts.body);
          }
          if (pathName === "/email-settings/test-digest") {
            return {
              status: "simulated",
              provider: "local_preview",
              job_count: 5,
              preview_html: "<div>Test Digest HTML</div>",
            };
          }
          return {};
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  const alert = harness.findAll(tree, (el) => el.props?.role === "alert")[0];
  assert.ok(
    alert,
    "Failed /email-settings load must render SectionState role=alert instead of loading forever",
  );
  assert.match(harness.textOf(alert), /Email settings API offline/);

  // Stale-response cancellation: trigger slow load via Retry, then rotate accessToken to trigger fresh load
  failLoad = false;
  slowMode = true;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  const slowPromise = retryBtn.props.onClick();

  slowMode = false;
  currentToken = "tok-2";
  harness.render();
  await harness.flushEffects();
  tree = harness.render();

  assert.equal(
    slowSignals[0]?.aborted,
    true,
    "New load must abort previous AbortController signal",
  );

  // Even if stale promise resolves later without honoring AbortSignal, loadSeqRef discards it
  slowDeferred.resolve({ ...settingsFixture, recipient_email: "stale@example.com" });
  await slowPromise;
  tree = harness.render();

  const emailInputAfterRace = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "email",
  )[0];
  assert.equal(
    emailInputAfterRace.props.value,
    "ada@example.com",
    "Stale slow response must NOT overwrite fresher loaded settings",
  );

  // Bound labels for all 8 controls
  const labels = harness.findAll(tree, (el) => el.type === "label");
  assert.equal(
    labels.length,
    8,
    "Email Settings form must bind all 8 controls with <label htmlFor>",
  );
  for (const lbl of labels) {
    assert.ok(lbl.props?.htmlFor);
    assert.ok(
      harness.findAll(tree, (el) => el.props?.id === lbl.props.htmlFor)[0],
      `Expected input/select with id="${lbl.props.htmlFor}"`,
    );
  }

  // Accent styling on checkbox and range slider
  const checkbox = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "checkbox",
  )[0];
  const rangeInput = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "range",
  )[0];
  assert.match(checkbox.props.className, /accent-\[rgb\(var\(--accent\)\)\]/);
  assert.match(rangeInput.props.className, /accent-\[rgb\(var\(--accent\)\)\]/);

  // Iframe preview wrapper
  const iframe = harness.findAll(tree, (el) => el.type === "iframe")[0];
  assert.ok(iframe);
  assert.equal(iframe.props.title, "Email digest preview");
  assert.equal(iframe.props.sandbox, "");
  assert.equal(iframe.props.srcDoc, previewFixture);
  const framedWell = harness.findAll(
    tree,
    (el) =>
      typeof el.props?.className === "string" &&
      el.props.className.includes("bg-subtle") &&
      el.props.className.includes("border-hairline") &&
      el.props.className.includes("rounded-2xl") &&
      harness.findAll(el, (child) => child.type === "iframe").length === 1,
  )[0];
  assert.ok(
    framedWell,
    "Preview iframe must sit in crisp themed bg-subtle border-hairline rounded-2xl wrapper",
  );

  // Save & Test digest actions
  const form = harness.findAll(tree, (el) => el.type === "form")[0];
  await form.props.onSubmit({ preventDefault: () => {} });
  assert.ok(apiCalls.some((c) => c.pathName === "/email-settings" && c.opts?.method === "PUT"));

  const testBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Send Test Digest Now"),
  )[0];
  await testBtn.props.onClick();
  tree = harness.render();
  assert.ok(
    apiCalls.some((c) => c.pathName === "/email-settings/test-digest" && c.opts?.method === "POST"),
  );
  assert.equal(
    harness.findAll(tree, (el) => el.type === "iframe")[0].props.srcDoc,
    "<div>Test Digest HTML</div>",
  );

  harness.unmount();
});

test("Profile Settings (/profile-settings) handles error+Retry, binds all labels including passwords, 44px visa target, and saves profile/password", async () => {
  let failProfile = true;
  const updatedUsers = [];
  const apiCalls = [];

  const profileFixture = {
    user_id: 1,
    email: "ada@example.com",
    full_name: "Ada Lovelace",
    role: "user",
    headline: "Principal AI Architect",
    country: "France",
    preferred_countries: ["France", "Norway"],
    cities: ["Paris"],
    experience_level: "senior",
    years_experience: 8,
    preferred_roles: ["AI Architect"],
    technologies: ["Python", "FastAPI", "RAG"],
    languages: ["English", "French"],
    salary_expectation: "100k EUR",
    salary_min: null,
    salary_max: null,
    salary_currency: "EUR",
    visa_required: true,
    remote_preference: "hybrid",
    onboarding_completed: true,
  };

  const harness = createInteractiveHarness("app/profile-settings/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/store/auth-store": {
        useAuthStore: () => ({
          user: {
            id: 1,
            email: "ada@example.com",
            full_name: "Ada Lovelace",
            role: "user",
            onboarding_completed: true,
          },
          accessToken: "tok",
          hydrated: true,
          setSession: () => {},
          updateUser: (patch) => updatedUsers.push(patch),
        }),
      },
      "@/lib/api": {
        ApiError: MockApiError,
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/profile" && (!opts?.method || opts.method === "GET")) {
            if (failProfile) throw new Error("Profile service unavailable");
            return profileFixture;
          }
          if (pathName === "/profile" && opts?.method === "PUT") {
            return { ...profileFixture, ...JSON.parse(opts.body) };
          }
          if (pathName === "/auth/change-password") {
            return { ok: true };
          }
          return {};
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  const alert = harness.findAll(tree, (el) => el.props?.role === "alert")[0];
  assert.ok(alert, "Failed GET /profile must render SectionState role=alert instead of empty form");
  assert.match(harness.textOf(alert), /Profile service unavailable/);
  assert.equal(harness.findAll(tree, (el) => el.type === "form").length, 0);

  failProfile = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  const forms = harness.findAll(tree, (el) => el.type === "form");
  assert.equal(forms.length, 2, "Must render Preferences form and Security password form");

  // Every input & select must have a bound <label htmlFor>
  const controls = harness.findAll(
    tree,
    (el) => el.type === "input" || el.type === "select" || el.type === "textarea",
  );
  assert.equal(controls.length, 15, "Expected 13 profile controls + 2 password controls");
  for (const ctrl of controls) {
    assert.ok(ctrl.props?.id, "Every control on /profile-settings must have an id");
    const lbl = harness.findAll(
      tree,
      (el) => el.type === "label" && el.props?.htmlFor === ctrl.props.id,
    )[0];
    assert.ok(lbl, `Expected <label htmlFor="${ctrl.props.id}">`);
  }

  const visaCheckbox = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "checkbox",
  )[0];
  assert.match(visaCheckbox.props.className, /accent-\[rgb\(var\(--accent\)\)\]/);
  const visaLabel = harness.findAll(
    tree,
    (el) => el.type === "label" && el.props?.htmlFor === visaCheckbox.props.id,
  )[0];
  assert.match(visaLabel.props.className, /min-h-\[44px\]/);

  // Save profile updates auth store
  await forms[0].props.onSubmit({ preventDefault: () => {} });
  assert.ok(apiCalls.some((c) => c.pathName === "/profile" && c.opts?.method === "PUT"));
  assert.equal(updatedUsers[0].full_name, "Ada Lovelace");

  // Password validation (<8 chars) shows alert without calling API, then valid password submits
  const pwInputs = harness.findAll(
    tree,
    (el) => el.type === "input" && el.props?.type === "password",
  );
  pwInputs[0].props.onChange({ target: { value: "old-pass-123" } });
  pwInputs[1].props.onChange({ target: { value: "short" } });
  tree = harness.render();
  await harness
    .findAll(tree, (el) => el.type === "form")[1]
    .props.onSubmit({
      preventDefault: () => {},
    });
  tree = harness.render();
  assert.equal(
    apiCalls.some((c) => c.pathName === "/auth/change-password"),
    false,
  );
  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 1);

  harness
    .findAll(tree, (el) => el.type === "input" && el.props?.type === "password")[1]
    .props.onChange({ target: { value: "new-botanical-pass-2026" } });
  tree = harness.render();
  await harness
    .findAll(tree, (el) => el.type === "form")[1]
    .props.onSubmit({
      preventDefault: () => {},
    });
  assert.ok(
    apiCalls.some((c) => c.pathName === "/auth/change-password" && c.opts?.method === "POST"),
  );

  harness.unmount();
});

test("Python render_digest_html outputs Option 3 Light Mode HTML, escapes XSS, sanitizes apply_url, and preserves dispatch_email_digest", () => {
  const pythonExe = findPythonExecutable();
  const script = `
import asyncio, json, sys
sys.path.insert(0, r"${path.join(repoRoot, "apps/api").replace(/\\/g, "\\\\")}")
from app.services.emailer import render_digest_html, dispatch_email_digest

html_out = render_digest_html(
    '<script>alert("name")</script>',
    'Top Roles & "Matches" <2026>',
    [
        {
            "title": '<img src=x onerror=alert(1)>AI Engineer',
            "company": 'Oat & <Spruce>',
            "location": 'Paris, "FR"',
            "score": 92,
            "apply_url": 'javascript:alert(1)',
            "matched_skills": ['Python', '<FastAPI>'],
            "missing_skills": ['K8s & Docker'],
        },
        {
            "title": 'Staff ML Engineer',
            "company": 'Nordic Lab',
            "location": 'Remote',
            "score": 85,
            "apply_url": 'https://jobs.example.com/role?id=42&ref=digest',
            "matched_skills": ['PyTorch'],
            "missing_skills": [],
        },
    ],
)
empty_out = render_digest_html('Ada', 'Empty Digest', [])
sim_result = asyncio.run(dispatch_email_digest('ada@example.com', 'Subject', html_out))
print(json.dumps({"html": html_out, "empty": empty_out, "sim": list(sim_result)}))
`;

  const raw = execFileSync(pythonExe, ["-c", script], { encoding: "utf8" });
  const parsed = JSON.parse(raw);

  // Escaping and URL sanitization
  assert.doesNotMatch(parsed.html, /<script>/i);
  assert.doesNotMatch(parsed.html, /<img\b/i);
  assert.doesNotMatch(parsed.html, /javascript:/i);
  assert.match(parsed.html, /&lt;script&gt;/);
  assert.match(parsed.html, /&lt;img src=x onerror=alert\(1\)&gt;AI Engineer/);
  assert.match(parsed.html, /href="#"/);
  assert.match(parsed.html, /href="https:\/\/jobs\.example\.com\/role\?id=42&amp;ref=digest"/);

  // Option 3 Light Mode tokens & banned legacy tokens absent
  for (const expected of [
    "#F3F1EC",
    "#FCFBF8",
    "#E2DFD6",
    "#1B201C",
    "#3F4741",
    "#59615B",
    "#2D6A4F",
    "#FFFFFF",
    "Plus Jakarta Sans",
  ]) {
    assert.ok(parsed.html.includes(expected), `Digest HTML must include ${expected}`);
  }
  for (const banned of ["#09090b", "#7c3aed", "#a78bfa", "Inter", "Roboto", "Arial"]) {
    assert.ok(!parsed.html.includes(banned), `Digest HTML must NOT include ${banned}`);
  }

  assert.match(parsed.empty, /No jobs met your minimum match threshold today/);
  assert.deepEqual(parsed.sim, ["simulated", "local_preview", ""]);
});
