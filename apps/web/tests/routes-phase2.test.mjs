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

    if (node.type === React.Fragment || node.type === React.Suspense) {
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

function createBaseMocks(overrides = {}) {
  return {
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...props }) =>
        React.createElement("a", { href, ...props }, children),
    },
    "next/navigation": {
      useRouter: () => ({ push: () => {} }),
      usePathname: () => "/dashboard",
      useSearchParams: () => new URLSearchParams(),
      useParams: () => ({ id: "42" }),
    },
    "@/lib/api": {
      apiFetch: async () => ({}),
    },
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
        updateUser: () => {},
      }),
    },
    "@/components/providers": {
      useToast: () => ({ pushToast: () => {} }),
    },
    ...overrides,
  };
}

function makeMatch(id, score = 92) {
  return {
    job_id: id,
    title: `Senior AI Engineer ${id}`,
    company: `Nordic Studio ${id}`,
    location: "Paris, France",
    country: "France",
    city: "Paris",
    remote_mode: "hybrid",
    source: "greenhouse",
    apply_url: `https://example.com/jobs/${id}`,
    posted_at: "2026-11-11T10:00:00Z",
    salary_text: "80k-95k EUR",
    is_saved: false,
    score,
    skill_score: 55,
    semantic_score: 23,
    experience_score: 14,
    matched_skills: ["Python", "FastAPI", "RAG", "Docker"],
    strengths: ["Strong FastAPI & RAG overlap", "Senior backend delivery"],
    missing_skills: ["Kubernetes"],
    action_items: ["Highlight distributed inference benchmarks"],
    recommendation: "Strong fit across core AI engineering stack.",
  };
}

function makeAnalytics(overrides = {}) {
  return {
    kpis: {
      total_jobs: 148,
      jobs_last_24h: 14,
      average_match_score: 76,
      high_match_jobs: 12,
      saved_count: 4,
      applied_count: 2,
      digests_sent: 3,
      ...overrides,
    },
    score_distribution: [],
    jobs_by_source: [],
    jobs_by_remote_mode: [],
    top_market_skills: [],
    application_funnel: [],
  };
}

function makeCv(overrides = {}) {
  return {
    id: 7,
    filename: "very-long-unbreakable-ada-lovelace-senior-ai-cv-2026.pdf",
    mime_type: "application/pdf",
    file_size: 24576,
    is_primary: true,
    encrypted: true,
    created_at: "2026-11-10T10:00:00Z",
    parsed: {
      summary: "Staff AI engineer specializing in RAG pipelines and FastAPI services.",
      skills: ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL", "Docker"],
      languages: ["English", "French"],
      years_experience: 6,
      experience_level: "senior",
      suggested_roles: ["AI Engineer"],
    },
    ...overrides,
  };
}

test("All 4 Task 6 route files remove Sidebar and avoid banned tokens, dark: overrides, uppercase, emojis, and 4-card KPI grids", () => {
  const files = [
    "app/dashboard/page.tsx",
    "app/jobs/page.tsx",
    "app/jobs/[id]/page.tsx",
    "app/saved-jobs/page.tsx",
  ];

  for (const rel of files) {
    const src = fs.readFileSync(path.join(webRoot, rel), "utf8");
    assert.doesNotMatch(src, /@\/components\/sidebar/, `Sidebar import must be removed from ${rel}`);
    assert.doesNotMatch(src, /<Sidebar\b/, `<Sidebar /> usage must be removed from ${rel}`);
    assert.doesNotMatch(
      src,
      /\bbg-white\b|\btext-white\b|\btext-black\b|\bdark:|violet-|#7c3aed|amber-|zinc-|emerald-|rose-|indigo-|purple-|bg-brand|\bglass\b|shadow-violet|radial-gradient|data-preserve-white|lucide-react|\bborder-l(-|\b)/,
      `Banned token/class detected in ${rel}`,
    );
    assert.doesNotMatch(
      src,
      /[\u{1F300}-\u{1FAFF}\u2713\u25B3\u2192\u2197]/u,
      `Unicode emoji/arrow symbol detected in ${rel}`,
    );
    assert.doesNotMatch(src, /\buppercase\b/, `Gratuitous uppercase detected in ${rel}`);
  }

  const dashboardSrc = fs.readFileSync(path.join(webRoot, "app/dashboard/page.tsx"), "utf8");
  assert.doesNotMatch(dashboardSrc, /lg:grid-cols-4/, "Dashboard must NOT use 4-card KPI grid");
  assert.doesNotMatch(
    dashboardSrc,
    /<MotionReveal[^>]*>[\s\S]*Today&apos;s Strongest Match|<MotionReveal[^>]*>[\s\S]*Today's Strongest Match/,
    "Dashboard top Hero Bento row must NOT be wrapped in MotionReveal",
  );
});

test("Dashboard (/dashboard) renders hydration-safe greeting, hairline strip, 68/32 Hero Bento, Active Resume, error+Retry, and slice(1) stream", async () => {
  // SSR check: must not embed user.full_name during SSR to prevent hydration mismatch
  const { default: DashboardPage } = loadPageModule("app/dashboard/page.tsx", createBaseMocks());
  const ssrHtml = renderToStaticMarkup(React.createElement(DashboardPage));
  assert.match(ssrHtml, /font-display/);
  assert.doesNotMatch(ssrHtml, /Ada Lovelace/, "SSR must gate user.full_name behind mounted guard");

  let failDashboard = true;
  let matchList = [makeMatch(101, 92), makeMatch(102, 84), makeMatch(103, 78)];
  let cvItems = [makeCv()];
  const apiCalls = [];
  const toasts = [];

  const harness = createInteractiveHarness("app/dashboard/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "framer-motion": {
        ...webRequire("framer-motion"),
        useReducedMotion: () => true,
      },
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/matches/daily?limit=8") {
            if (failDashboard) throw new Error("Matches service unavailable");
            return matchList;
          }
          if (pathName === "/analytics/overview") {
            return makeAnalytics();
          }
          if (pathName === "/cvs") {
            return { items: cvItems };
          }
          if (pathName === "/jobs/ingest") {
            return { total_ingested: 12 };
          }
          if (pathName === "/saved-jobs") {
            return { id: 1, job_id: 102, status: "saved" };
          }
          if (pathName.startsWith("/saved-jobs/")) {
            return { status: "removed" };
          }
          return {};
        },
      },
      "@/components/providers": {
        useToast: () => ({ pushToast: (msg, kind) => toasts.push({ msg, kind }) }),
      },
    }),
  );

  // Pre-mount render must match SSR
  let tree = harness.render();
  assert.doesNotMatch(harness.textOf(tree), /Ada Lovelace/);

  await harness.flushEffects();
  tree = harness.render();

  // Post-mount renders greeting + explicit error alert (NOT fake empty state)
  assert.match(harness.textOf(tree), /Ada Lovelace/);
  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1, "Failed /dashboard fetch must render SectionState role=alert");
  assert.match(harness.textOf(alerts[0]), /Matches service unavailable/);
  assert.doesNotMatch(harness.textOf(tree), /No ranked matches yet/);

  // Clicking Retry loads 3 parallel endpoints and renders Hero Bento + Active Resume + slice(1) stream
  failDashboard = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  assert.ok(retryBtn);
  await retryBtn.props.onClick();
  tree = harness.render();

  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 0);
  const fullText = harness.textOf(tree);
  assert.match(fullText, /Indexed Jobs/);
  assert.match(fullText, /148/);
  assert.match(fullText, /92\/100/);
  assert.match(fullText, /Today's Strongest Match/);
  assert.match(fullText, /55\/60/);
  assert.match(fullText, /23\/25/);
  assert.match(fullText, /14\/15/);
  assert.match(fullText, /Active Resume/);
  assert.match(fullText, /Ready/);
  assert.match(fullText, /very-long-unbreakable-ada-lovelace-senior-ai-cv-2026\.pdf/);

  // Filename uses min-w-0 and break-all
  const filenameNode = harness.findAll(
    tree,
    (el) =>
      typeof el.props?.className === "string" &&
      el.props.className.includes("break-all") &&
      harness.textOf(el).includes("very-long-unbreakable-ada-lovelace-senior-ai-cv-2026.pdf"),
  )[0];
  assert.ok(filenameNode, "Active Resume filename must use break-all for mobile safety");

  // Links: Explore Role -> /jobs/101, Replace CV -> /cvs
  const exploreLink = harness.findAll(
    tree,
    (el) => el.type === "a" && el.props?.href === "/jobs/101",
  )[0];
  assert.ok(exploreLink);
  const replaceCvLink = harness.findAll(
    tree,
    (el) => el.type === "a" && el.props?.href === "/cvs" && harness.textOf(el).includes("Replace CV"),
  )[0];
  assert.ok(replaceCvLink);

  // Curated Match Stream renders remaining matches (matches.slice(1)) without duplicating hero match 101
  const streamArticles = harness.findAll(tree, (el) => el.type === "article");
  assert.equal(streamArticles.length, 2, "Curated Match Stream must render matches.slice(1) only");
  assert.doesNotMatch(harness.textOf(streamArticles[0]), /Senior AI Engineer 101/);
  assert.match(harness.textOf(streamArticles[0]), /Senior AI Engineer 102/);
  assert.match(harness.textOf(streamArticles[1]), /Senior AI Engineer 103/);

  // Save toggle in Curated Match Stream triggers POST /saved-jobs
  const saveButtons = harness.findAll(
    tree,
    (el) => el.type === "button" && el.props?.["aria-label"] === "Save Senior AI Engineer 102",
  );
  assert.equal(saveButtons.length, 1);
  await saveButtons[0].props.onClick();
  assert.ok(apiCalls.some((c) => c.pathName === "/saved-jobs" && c.opts?.method === "POST"));

  // Fetch Live Jobs button triggers POST /jobs/ingest
  const fetchLiveBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Fetch Live Jobs"),
  )[0];
  assert.ok(fetchLiveBtn);
  // Test single-match graceful state on reload
  matchList = [makeMatch(201, 88)];
  cvItems = [];
  await fetchLiveBtn.props.onClick();
  tree = harness.render();

  assert.ok(apiCalls.some((c) => c.pathName === "/jobs/ingest" && c.opts?.method === "POST"));
  assert.equal(
    harness.findAll(tree, (el) => el.type === "article").length,
    0,
    "When matches.length === 1, hero card must NOT be duplicated in Curated Match Stream",
  );
  assert.doesNotMatch(
    harness.textOf(tree),
    /No daily matches ranked yet/,
    "When matches.length === 1, must NOT show empty-state copy",
  );
  assert.match(harness.textOf(tree), /Senior AI Engineer 201/);
  assert.ok(
    harness.findAll(
      tree,
      (el) => el.type === "a" && el.props?.href === "/cvs" && harness.textOf(el).includes("Upload"),
    )[0],
    "When primaryCv is null, Active Resume must render direct CV upload callout",
  );

  harness.unmount();
});

test("Job Explorer (/jobs) renders 290px FilterPanel grid, error+Retry distinct from empty state, URL params, and accessible pagination", async () => {
  const src = fs.readFileSync(path.join(webRoot, "app/jobs/page.tsx"), "utf8");
  assert.match(src, /lg:grid-cols-\[290px_1fr\]/);

  let failJobs = true;
  let responsePayload = {
    items: [
      {
        id: 11,
        title: "Staff RAG Architect",
        company: "Botanical AI",
        location: "Paris, France",
        country: "France",
        city: "Paris",
        remote_mode: "remote",
        contract_type: "CDI",
        experience_level: "senior",
        salary_text: "95k EUR",
        skills: ["Python", "RAG"],
        source: "greenhouse",
        apply_url: "https://example.com/11",
        posted_at: "2026-11-11T09:00:00Z",
        score: 90,
        is_saved: false,
      },
    ],
    total: 25,
    page: 1,
    page_size: 12,
    total_pages: 3,
    available_sources: ["greenhouse", "remoteok"],
    available_countries: ["France", "Germany"],
  };
  const requestedUrls = [];

  const harness = createInteractiveHarness("app/jobs/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: () => {} }),
        usePathname: () => "/jobs",
        useSearchParams: () => new URLSearchParams("sort=score&q=rag&remote_mode=remote"),
      },
      "@/lib/api": {
        apiFetch: async (pathName) => {
          requestedUrls.push(pathName);
          if (pathName.startsWith("/jobs?")) {
            if (failJobs) throw new Error("Job index timed out");
            return responsePayload;
          }
          return {};
        },
      },
    }),
  );

  let tree = harness.render();
  await harness.flushEffects(260);
  tree = harness.render();

  assert.ok(requestedUrls[0].includes("sort=score"));
  assert.ok(requestedUrls[0].includes("q=rag"));
  assert.ok(requestedUrls[0].includes("remote_mode=remote"));

  // Error alert renders instead of fake empty state
  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /Job index timed out/);
  assert.doesNotMatch(harness.textOf(tree), /No jobs match your current filters/);

  // Retry recovers and renders paginated results
  failJobs = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  assert.match(harness.textOf(tree), /Staff RAG Architect/);
  assert.match(harness.textOf(tree), /Page 1 of 3/);

  const prevBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Previous",
  )[0];
  const nextBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Next",
  )[0];
  assert.ok(prevBtn && nextBtn);
  assert.match(prevBtn.props.className, /min-h-\[44px\]/);
  assert.match(nextBtn.props.className, /min-h-\[44px\]/);
  assert.equal(prevBtn.props.disabled, true);
  assert.equal(nextBtn.props.disabled, false);

  // Clicking Next sets page=2 and loads page 2
  responsePayload = { ...responsePayload, page: 2 };
  nextBtn.props.onClick();
  tree = harness.render();
  await harness.flushEffects(260);
  tree = harness.render();
  assert.ok(requestedUrls.some((u) => u.includes("page=2")));
  assert.match(harness.textOf(tree), /Page 2 of 3/);

  // Empty data renders empty guidance (not error)
  responsePayload = { ...responsePayload, items: [], total: 0, page: 1, total_pages: 1 };
  const resetBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Reset",
  )[0];
  resetBtn.props.onClick();
  tree = harness.render();
  await harness.flushEffects(260);
  tree = harness.render();
  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 0);
  assert.match(harness.textOf(tree), /No jobs match your current filters/);

  harness.unmount();
});

test("Job Details (/jobs/[id]) renders 65/35 Bento dossier, max-w-[68ch], safe apply URLs, bound labels, error+Retry, tracker & pitch", async () => {
  let failDetail = true;
  let detailPayload = {
    id: 42,
    title: "Principal AI Systems Engineer",
    company: "Fjord Tech",
    location: "Oslo, Norway",
    country: "Norway",
    city: "Oslo",
    remote_mode: "hybrid",
    contract_type: "Full-time",
    experience_level: "senior",
    salary_text: "110k EUR",
    skills: ["Python", "FastAPI", "RAG"],
    source: "ashby",
    apply_url: "javascript:alert(1)",
    posted_at: "2026-11-11T08:00:00Z",
    score: 89,
    description: "Build reliable retrieval pipelines and production agent APIs.",
    is_saved: false,
    saved: null,
    match: {
      score: 89,
      skill_score: 52,
      semantic_score: 23,
      experience_score: 14,
      matched_skills: ["Python", "FastAPI", "RAG"],
      strengths: ["Strong retrieval systems experience"],
      missing_skills: ["Terraform"],
      action_items: ["Mention latency optimization metrics"],
      recommendation: "High fit for backend AI infrastructure.",
    },
  };
  const apiCalls = [];

  const harness = createInteractiveHarness("app/jobs/[id]/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: () => {} }),
        usePathname: () => "/jobs/42",
        useParams: () => ({ id: "42" }),
      },
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/jobs/42") {
            if (failDetail) throw new Error("Role dossier unavailable");
            return detailPayload;
          }
          if (pathName === "/saved-jobs") {
            return { id: 9, job_id: 42, status: "applied", notes: "Spoke with recruiter" };
          }
          if (pathName === "/ai/cover-letter") {
            return { cover_letter: "Dear Fjord Tech team,\nI am excited to apply." };
          }
          return {};
        },
      },
    }),
  );

  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /Role dossier unavailable/);

  // Retry succeeds
  failDetail = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  assert.match(harness.textOf(tree), /Principal AI Systems Engineer/);
  const maxWidthDesc = harness.findAll(
    tree,
    (el) => typeof el.props?.className === "string" && el.props.className.includes("max-w-[68ch]"),
  )[0];
  assert.ok(maxWidthDesc, "Job description must enforce max-w-[68ch] reading measure");

  // Unsafe javascript: apply_url must NOT render an anchor
  const badLinks = harness.findAll(
    tree,
    (el) => el.type === "a" && String(el.props?.href || "").startsWith("javascript:"),
  );
  assert.equal(badLinks.length, 0);

  // Verify label htmlFor bindings for pitch tone + tracker select & textarea
  const labels = harness.findAll(tree, (el) => el.type === "label");
  assert.ok(labels.length >= 3);
  for (const lbl of labels) {
    const htmlFor = lbl.props?.htmlFor;
    assert.ok(htmlFor, "Every <label> on /jobs/[id] must specify htmlFor");
    const matchingControl = harness.findAll(tree, (el) => el.props?.id === htmlFor)[0];
    assert.ok(matchingControl, `Expected control with id="${htmlFor}"`);
  }

  // Generate AI pitch -> displays bound textarea
  const pitchBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Generate Pitch"),
  )[0];
  await pitchBtn.props.onClick();
  tree = harness.render();
  assert.ok(apiCalls.some((c) => c.pathName === "/ai/cover-letter" && c.opts?.method === "POST"));
  const pitchArea = harness.findAll(
    tree,
    (el) => el.type === "textarea" && el.props?.id === "pitch-draft",
  )[0];
  assert.ok(pitchArea);
  assert.ok(
    harness.findAll(tree, (el) => el.type === "label" && el.props?.htmlFor === "pitch-draft")[0],
    "Generated pitch textarea must have matching <label htmlFor='pitch-draft'>",
  );
  assert.match(pitchArea.props.value, /Dear Fjord Tech team/);

  // Save tracker -> POST /saved-jobs
  const statusSelect = harness.findAll(
    tree,
    (el) => el.type === "select" && el.props?.id === "tracker-status",
  )[0];
  statusSelect.props.onChange({ target: { value: "applied" } });
  const notesArea = harness.findAll(
    tree,
    (el) => el.type === "textarea" && el.props?.id === "tracker-notes",
  )[0];
  notesArea.props.onChange({ target: { value: "Spoke with recruiter" } });
  tree = harness.render();

  const saveTrackerBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Save Job"),
  )[0];
  await saveTrackerBtn.props.onClick();
  tree = harness.render();
  const savedPost = apiCalls.find((c) => c.pathName === "/saved-jobs" && c.opts?.method === "POST");
  assert.ok(savedPost);
  assert.deepEqual(JSON.parse(savedPost.opts.body), {
    job_id: 42,
    status: "applied",
    notes: "Spoke with recruiter",
  });
  assert.match(harness.textOf(tree), /Update Tracker/);

  // Re-check safe https apply URL renders with noopener noreferrer
  detailPayload = { ...detailPayload, apply_url: "https://jobs.fjord.no/42" };
  const backTreeHarness = createInteractiveHarness("app/jobs/[id]/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "next/navigation": {
        useRouter: () => ({ push: () => {} }),
        usePathname: () => "/jobs/42",
        useParams: () => ({ id: "42" }),
      },
      "@/lib/api": {
        apiFetch: async () => detailPayload,
      },
    }),
  );
  backTreeHarness.render();
  await backTreeHarness.flushEffects();
  const safeTree = backTreeHarness.render();
  const safeAnchor = backTreeHarness.findAll(
    safeTree,
    (el) => el.type === "a" && el.props?.href === "https://jobs.fjord.no/42",
  )[0];
  assert.ok(safeAnchor);
  assert.equal(safeAnchor.props.rel, "noopener noreferrer");

  harness.unmount();
  backTreeHarness.unmount();
});

test("Saved Jobs (/saved-jobs) renders capsule aria-pressed tabs, safe URLs, bound inline notes, danger remove, and error+Retry", async () => {
  let failSaved = true;
  const apiCalls = [];
  const savedItems = [
    {
      id: 1,
      job_id: 501,
      status: "saved",
      notes: "Initial bookmark",
      applied_at: null,
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-10T10:00:00Z",
      job: {
        id: 501,
        title: "ML Platform Engineer",
        company: "Spruce Systems",
        location: "Berlin, Germany",
        country: "Germany",
        city: "Berlin",
        remote_mode: "hybrid",
        source: "lever",
        apply_url: "https://jobs.spruce.de/501",
        salary_text: "90k EUR",
        posted_at: "2026-11-10T10:00:00Z",
        score: 86,
      },
    },
    {
      id: 2,
      job_id: 502,
      status: "applied",
      notes: "",
      applied_at: "2026-11-11T09:00:00Z",
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-11T09:00:00Z",
      job: {
        id: 502,
        title: "Applied AI Researcher",
        company: "Oat Labs",
        location: "Remote",
        country: "Worldwide",
        city: "",
        remote_mode: "remote",
        source: "remoteok",
        apply_url: "javascript:void(0)",
        salary_text: "",
        posted_at: "2026-11-11T09:00:00Z",
        score: null,
      },
    },
  ];

  const harness = createInteractiveHarness("app/saved-jobs/page.tsx", (reactMock) =>
    createBaseMocks({
      react: reactMock,
      "@/lib/api": {
        apiFetch: async (pathName, opts) => {
          apiCalls.push({ pathName, opts });
          if (pathName === "/saved-jobs") {
            if (failSaved) throw new Error("Tracker database unreachable");
            return { items: savedItems };
          }
          return { status: "ok" };
        },
      },
    }),
  );

  harness.render();
  await harness.flushEffects();
  let tree = harness.render();

  // Error renders role=alert + Retry (not empty state)
  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /Tracker database unreachable/);
  assert.doesNotMatch(harness.textOf(tree), /No jobs in this pipeline stage/);

  // Retry loads items
  failSaved = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  await retryBtn.props.onClick();
  tree = harness.render();

  // Capsule stage tabs have aria-pressed, tabular-nums, and >=44px mobile hit target
  const tabBtns = harness.findAll(
    tree,
    (el) => el.type === "button" && el.props?.["aria-pressed"] !== undefined,
  );
  assert.equal(tabBtns.length, 6);
  assert.equal(tabBtns[0].props["aria-pressed"], true);
  assert.match(tabBtns[0].props.className, /min-h-\[44px\]/);
  assert.match(harness.textOf(tabBtns[0]), /All\s*\(2\)/);

  // Unsafe javascript: apply_url is omitted, safe https:// link is kept with noopener noreferrer
  assert.equal(
    harness.findAll(
      tree,
      (el) => el.type === "a" && String(el.props?.href || "").startsWith("javascript:"),
    ).length,
    0,
  );
  const safeApply = harness.findAll(
    tree,
    (el) => el.type === "a" && el.props?.href === "https://jobs.spruce.de/501",
  )[0];
  assert.ok(safeApply);
  assert.equal(safeApply.props.rel, "noopener noreferrer");

  // Edit Notes -> bound label htmlFor + textarea -> Save Notes PATCH /saved-jobs/501
  const editNotesBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Edit Notes",
  )[0];
  editNotesBtn.props.onClick();
  tree = harness.render();

  const notesArea = harness.findAll(tree, (el) => el.type === "textarea")[0];
  assert.ok(notesArea?.props?.id);
  const notesLabel = harness.findAll(
    tree,
    (el) => el.type === "label" && el.props?.htmlFor === notesArea.props.id,
  )[0];
  assert.ok(notesLabel, "Inline notes editor must bind <label htmlFor> to textarea");

  notesArea.props.onChange({ target: { value: "Interview Thursday 10am" } });
  tree = harness.render();
  const saveNotesBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Save Notes",
  )[0];
  await saveNotesBtn.props.onClick();
  tree = harness.render();

  const patchNotes = apiCalls.find((c) => c.pathName === "/saved-jobs/501" && c.opts?.method === "PATCH");
  assert.ok(patchNotes);
  assert.deepEqual(JSON.parse(patchNotes.opts.body), { notes: "Interview Thursday 10am" });
  assert.match(harness.textOf(tree), /Interview Thursday 10am/);

  // Filter tab Applied updates aria-pressed and shows only Applied card
  const appliedTab = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Applied"),
  )[0];
  appliedTab.props.onClick();
  tree = harness.render();
  assert.equal(
    harness.findAll(tree, (el) => el.type === "article").length,
    1,
    "Applied tab must filter to 1 card",
  );
  assert.match(harness.textOf(tree), /Applied AI Researcher/);

  // Remove button uses danger token styling and DELETE /saved-jobs/502
  const removeBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Remove",
  )[0];
  assert.match(removeBtn.props.className, /bg-status-danger-bg/);
  await removeBtn.props.onClick();
  tree = harness.render();
  assert.ok(apiCalls.some((c) => c.pathName === "/saved-jobs/502" && c.opts?.method === "DELETE"));
  assert.match(harness.textOf(tree), /No jobs in this pipeline stage/);

  harness.unmount();
});
