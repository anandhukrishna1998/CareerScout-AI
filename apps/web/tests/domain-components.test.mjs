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

function loadUiModule(relPath, mocks = {}) {
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
      if (specifier.startsWith(".")) {
        const base = path.resolve(path.dirname(filePath), specifier);
        for (const candidate of [`${base}.tsx`, `${base}.ts`, base]) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return compileAndRun(candidate);
          }
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

function createInteractiveHarness(relPath, exportName, createMocks) {
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
  const mod = loadUiModule(relPath, mocks);
  const Component = mod[exportName];

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

const commonMocks = {
  "next/link": {
    __esModule: true,
    default: ({ href, children, ...props }) =>
      React.createElement("a", { href, ...props }, children),
  },
  "@/lib/api": {
    apiFetch: async () => ({ items: [] }),
  },
  "@/store/auth-store": {
    useAuthStore: () => ({
      accessToken: null,
      hydrated: true,
      setSession: () => {},
    }),
  },
  "./providers": {
    useToast: () => ({ pushToast: () => {} }),
  },
};

test("All 5 Task 4 files avoid banned tokens, lucide-react, border-left stripes, and emojis", () => {
  const files = [
    "components/job-card.tsx",
    "components/match-score-card.tsx",
    "components/filter-panel.tsx",
    "components/auth-gate.tsx",
    "components/ai-chat-panel.tsx",
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

test("JobCard renders semantic heading, 44px mobile targets, ScoreRing/No CV, max 5 skills, and safe Apply URLs", () => {
  const { JobCard } = loadUiModule("components/job-card.tsx", commonMocks);

  const html = renderToStaticMarkup(
    React.createElement(JobCard, {
      id: 42,
      title: "Senior AI & LLM Engineer",
      company: "Nordic Labs",
      location: "Paris, France",
      score: 91,
      remote: "hybrid",
      source: "Greenhouse",
      salaryText: "85k-105k EUR",
      postedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      applyUrl: "https://example.com/apply",
      skills: ["Python", "FastAPI", "LLM", "RAG", "Docker", "Kubernetes", "AWS"],
      isSaved: true,
      onToggleSave: () => {},
    }),
  );

  assert.match(html, /<article class="h-full">/);
  assert.match(html, /<h3[^>]*><a href="\/jobs\/42"[^>]*min-h-\[44px\][^>]*sm:min-h-0/);
  assert.match(html, /hover:border-accent\/40/);
  assert.match(html, /role="meter"/);
  assert.match(html, /aria-valuenow="91"/);
  assert.match(html, /font-mono[^>]*tabular-nums[^>]*>2h ago</);
  assert.match(html, /--status-success-bg/);
  assert.match(html, /85k-105k EUR/);
  assert.match(html, /View ATS Analysis/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />Saved</);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/example\.com\/apply"/);
  assert.match(html, /Python/);
  assert.match(html, /Docker/);
  assert.doesNotMatch(html, /Kubernetes/);
  assert.doesNotMatch(html, /AWS/);

  const noCvHtml = renderToStaticMarkup(
    React.createElement(JobCard, {
      id: 43,
      title: "ML Engineer",
      company: "Fjord AI",
      location: "Remote",
      score: null,
      remote: "remote",
      applyUrl: "javascript:alert(1)",
    }),
  );
  assert.match(noCvHtml, />No CV</);
  assert.doesNotMatch(noCvHtml, /javascript:/i);
  assert.doesNotMatch(noCvHtml, />Apply</);

  const dataUrlHtml = renderToStaticMarkup(
    React.createElement(JobCard, {
      id: 44,
      title: "Data Engineer",
      company: "Fjord AI",
      location: "Remote",
      score: 75,
      remote: "remote",
      applyUrl: "data:text/html,<script>alert(1)</script>",
    }),
  );
  assert.doesNotMatch(dataUrlHtml, /data:text\/html/i);
  assert.doesNotMatch(dataUrlHtml, />Apply</);
});

test("MatchScoreCard renders ScoreRing md, semantic bands, hairline split, SVG checks, warning badges, and action plan", () => {
  const { MatchScoreCard } = loadUiModule("components/match-score-card.tsx", commonMocks);

  const strongHtml = renderToStaticMarkup(
    React.createElement(MatchScoreCard, {
      score: 91,
      skillScore: 54,
      semanticScore: 23,
      experienceScore: 14,
      strengths: ["Python", "FastAPI", "RAG"],
      missing: ["Kubernetes", "Terraform"],
      recommendation: "Strong alignment with backend LLM pipelines.",
      actionItems: ["Highlight RAG latency benchmarks in CV summary."],
    }),
  );

  assert.match(strongHtml, /role="meter"/);
  assert.match(strongHtml, /aria-valuenow="91"/);
  assert.match(strongHtml, /Strong Fit/);
  assert.match(strongHtml, /54\/60/);
  assert.match(strongHtml, /23\/25/);
  assert.match(strongHtml, /14\/15/);
  assert.match(strongHtml, /tabular-nums/);
  assert.match(strongHtml, /--status-warning-bg/);
  assert.match(strongHtml, /Kubernetes/);
  assert.match(strongHtml, /Terraform/);
  assert.match(strongHtml, /<svg[^>]*aria-hidden="true"/);
  assert.match(strongHtml, /Highlight RAG latency benchmarks/);

  const moderateHtml = renderToStaticMarkup(
    React.createElement(MatchScoreCard, {
      score: 68,
      strengths: ["Python"],
      missing: [],
    }),
  );
  assert.match(moderateHtml, /Good Fit/);
  assert.match(moderateHtml, /No major missing skills detected/);

  const developingHtml = renderToStaticMarkup(
    React.createElement(MatchScoreCard, {
      score: 42,
      strengths: [],
      missing: ["Rust"],
    }),
  );
  assert.match(developingHtml, /Developing Fit/);
});

test("FilterPanel starts collapsed on mobile, toggles via aria-expanded, binds every label htmlFor, and keeps >=44px touch controls", () => {
  const { FilterPanel } = loadUiModule("components/filter-panel.tsx", commonMocks);

  const filters = {
    q: "LLM",
    country: "France",
    city: "",
    technologies: "Python",
    remote_mode: "remote",
    source: "all",
    posting_age_hours: 24,
    min_score: 70,
    sort: "score",
  };

  const html = renderToStaticMarkup(
    React.createElement(FilterPanel, {
      filters,
      availableSources: ["Greenhouse", "RemoteOK"],
      availableCountries: ["France", "Germany"],
      onChange: () => {},
      onReset: () => {},
      onRetry: () => {},
    }),
  );

  assert.match(html, /lg:sticky lg:top-24/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="hidden space-y-4/);
  assert.match(html, /accent-\[rgb\(var\(--accent\)\)\]/);
  assert.match(html, /min-h-\[44px\] w-full cursor-pointer/);
  assert.match(html, /min-h-\[44px\][^"]*lg:min-h-\[32px\]/);
  assert.match(html, /font-mono[^>]*tabular-nums[^>]*>70%</);
  assert.match(html, /font-mono[^>]*tabular-nums[^>]*>6</);
  assert.match(html, />Retry</);

  const fors = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(fors.length, 9);
  for (const id of fors) {
    assert.ok(html.includes(`id="${id}"`), `Expected matching control id="${id}"`);
  }

  const harness = createInteractiveHarness("components/filter-panel.tsx", "FilterPanel", (reactMock) => ({
    ...commonMocks,
    react: reactMock,
  }));

  let tree = harness.render({
    filters,
    availableSources: ["Greenhouse"],
    onChange: () => {},
    onReset: () => {},
  });
  let toggleBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && el.props?.["aria-expanded"] !== undefined,
  )[0];
  assert.equal(toggleBtn.props["aria-expanded"], false);

  toggleBtn.props.onClick();
  tree = harness.render();
  toggleBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && el.props?.["aria-expanded"] !== undefined,
  )[0];
  assert.equal(toggleBtn.props["aria-expanded"], true);
  const fieldsContainer = harness.findAll(
    tree,
    (el) => el.type === "div" && el.props?.id === toggleBtn.props["aria-controls"],
  )[0];
  assert.match(fieldsContainer.props.className, /\bblock\b/);
  harness.unmount();
});

test("AuthGate renders skeleton while unhydrated, calm rounded-3xl prompt when signed out, and children when signed in", () => {
  const loadingMod = loadUiModule("components/auth-gate.tsx", {
    ...commonMocks,
    "@/store/auth-store": {
      useAuthStore: () => ({ accessToken: null, hydrated: false, setSession: () => {} }),
    },
  });
  const loadingHtml = renderToStaticMarkup(
    React.createElement(loadingMod.AuthGate, null, React.createElement("div", null, "Secret")),
  );
  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /rounded-3xl/);
  assert.doesNotMatch(loadingHtml, /Secret/);

  const guestMod = loadUiModule("components/auth-gate.tsx", commonMocks);
  const guestHtml = renderToStaticMarkup(
    React.createElement(guestMod.AuthGate, null, React.createElement("div", null, "Secret")),
  );
  assert.match(guestHtml, /rounded-3xl/);
  assert.match(guestHtml, /Continue with Demo Account/);
  assert.match(guestHtml, /href="\/auth\/login"/);
  assert.match(guestHtml, /href="\/auth\/register"/);
  assert.doesNotMatch(guestHtml, /Secret/);

  const authedMod = loadUiModule("components/auth-gate.tsx", {
    ...commonMocks,
    "@/store/auth-store": {
      useAuthStore: () => ({ accessToken: "tok", hydrated: true, setSession: () => {} }),
    },
  });
  const authedHtml = renderToStaticMarkup(
    React.createElement(authedMod.AuthGate, null, React.createElement("div", null, "Secret")),
  );
  assert.equal(authedHtml, "<div>Secret</div>");
});

test("AIChatPanel renders accessible labels, studio bubble tokens, no nested aria-live, and explicit role=alert error + Retry", () => {
  const { AIChatPanel } = loadUiModule("components/ai-chat-panel.tsx", commonMocks);

  const html = renderToStaticMarkup(React.createElement(AIChatPanel, { initialJobId: 12 }));
  assert.match(html, /AI Career Assistant/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<option value="12" selected="">Selected role #12<\/option>/);

  // Ensure scroll container does not wrap status/alert inside nested aria-live
  assert.doesNotMatch(html, /<div[^>]*aria-live="polite"[^>]*>[\s\S]*role="status"/);

  const fors = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(fors.length, 2);
  for (const id of fors) {
    assert.ok(html.includes(`id="${id}"`), `Expected matching control id="${id}"`);
  }
});

test("AIChatPanel handles loadError + Retry recovery, optimistic rollback on send failure, and disables Clear while sending", async () => {
  let failLoad = true;
  let resolvePost = null;
  let rejectPost = null;
  const toastCalls = [];

  const harness = createInteractiveHarness(
    "components/ai-chat-panel.tsx",
    "AIChatPanel",
    (reactMock) => ({
      ...commonMocks,
      react: reactMock,
      "./providers": {
        useToast: () => ({
          pushToast: (msg, kind) => toastCalls.push({ msg, kind }),
        }),
      },
      "@/lib/api": {
        apiFetch: (pathName, opts) => {
          if (pathName === "/ai/chat/history" && (!opts || opts.method !== "DELETE")) {
            if (failLoad) return Promise.reject(new Error("History service unavailable"));
            return Promise.resolve({
              items: [
                {
                  id: 1,
                  role: "assistant",
                  content: "Initial guidance",
                  job_id: null,
                  created_at: "2026-11-11T10:00:00Z",
                },
              ],
            });
          }
          if (pathName.startsWith("/jobs?")) {
            if (failLoad) return Promise.reject(new Error("Jobs service unavailable"));
            return Promise.resolve({
              items: [
                {
                  id: 7,
                  title: "AI Engineer",
                  company: "Nordic AI",
                  score: 88,
                },
              ],
              total: 1,
              page: 1,
              page_size: 20,
              total_pages: 1,
              available_sources: [],
            });
          }
          if (pathName === "/ai/chat" && opts?.method === "POST") {
            return new Promise((resolve, reject) => {
              resolvePost = resolve;
              rejectPost = reject;
            });
          }
          return Promise.resolve({});
        },
      },
    }),
  );

  // 1. Initial failed load shows role=alert + Retry and hides composer form
  harness.render({});
  await harness.flushEffects();
  let tree = harness.render({});
  const alerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.match(harness.textOf(alerts[0]), /History service unavailable/);
  assert.equal(harness.findAll(tree, (el) => el.type === "form").length, 0);

  // 2. Clicking Retry recovers and displays loaded conversation + composer form
  failLoad = false;
  const retryBtn = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el).includes("Retry"),
  )[0];
  assert.ok(retryBtn);
  retryBtn.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = harness.render({});
  assert.equal(harness.findAll(tree, (el) => el.props?.role === "alert").length, 0);
  assert.equal(harness.findAll(tree, (el) => el.type === "form").length, 1);
  assert.match(harness.textOf(tree), /Initial guidance/);

  // 3. Submit message -> loading shimmer appears & Clear is disabled while in-flight
  let chatInput = harness.findAll(tree, (el) => el.type === "input")[0];
  chatInput.props.onChange({ target: { value: "Improve my CV summary" } });
  tree = harness.render({});

  const form = harness.findAll(tree, (el) => el.type === "form")[0];
  form.props.onSubmit({ preventDefault: () => {} });
  tree = harness.render({});

  assert.match(harness.textOf(tree), /Improve my CV summary/);
  assert.match(harness.textOf(tree), /Analyzing profile and job context/);
  const clearBtnWhileLoading = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Clear",
  )[0];
  assert.ok(clearBtnWhileLoading);
  assert.equal(clearBtnWhileLoading.props.disabled, true);

  // 4. Reject POST /ai/chat -> optimistic user bubble removed, input restored, role=alert shown
  rejectPost(new Error("AI timeout"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = harness.render({});

  assert.doesNotMatch(harness.textOf(tree), /Improve my CV summary/);
  chatInput = harness.findAll(tree, (el) => el.type === "input")[0];
  assert.equal(chatInput.props.value, "Improve my CV summary");
  const sendAlerts = harness.findAll(tree, (el) => el.props?.role === "alert");
  assert.equal(sendAlerts.length, 1);
  assert.match(harness.textOf(sendAlerts[0]), /AI timeout/);
  assert.equal(toastCalls.at(-1)?.kind, "error");

  // 5. Successful resubmit appends assistant reply and re-enables Clear
  const formRetry = harness.findAll(tree, (el) => el.type === "form")[0];
  formRetry.props.onSubmit({ preventDefault: () => {} });
  tree = harness.render({});
  resolvePost({
    reply: "Quantify RAG latency reductions.",
    message: {
      id: 99,
      role: "assistant",
      content: "Quantify RAG latency reductions.",
      job_id: null,
      created_at: "2026-11-11T10:05:00Z",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = harness.render({});
  assert.match(harness.textOf(tree), /Quantify RAG latency reductions\./);
  const clearBtnReady = harness.findAll(
    tree,
    (el) => el.type === "button" && harness.textOf(el) === "Clear",
  )[0];
  assert.equal(clearBtnReady.props.disabled, false);

  harness.unmount();
});
