import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

test("Light and Dark semantic palettes pass WCAG 2.2 AA contrast", () => {
  assert.ok(contrastRatio(LIGHT_TOKENS.textPrimary, LIGHT_TOKENS.bgCanvas) >= 4.5);
  assert.ok(contrastRatio(LIGHT_TOKENS.textMuted, LIGHT_TOKENS.bgSurface) >= 4.5);
  assert.ok(contrastRatio(LIGHT_TOKENS.accentInk, LIGHT_TOKENS.accent) >= 4.5);
  assert.ok(contrastRatio(LIGHT_TOKENS.borderInput, LIGHT_TOKENS.bgSubtle) >= 3.0);

  assert.ok(contrastRatio(DARK_TOKENS.textPrimary, DARK_TOKENS.bgCanvas) >= 4.5);
  assert.ok(contrastRatio(DARK_TOKENS.textMuted, DARK_TOKENS.bgSurface) >= 4.5);
  assert.ok(contrastRatio(DARK_TOKENS.accentInk, DARK_TOKENS.accent) >= 4.5);
  assert.ok(contrastRatio(DARK_TOKENS.accentText, DARK_TOKENS.bgSurface) >= 4.5);
  assert.ok(contrastRatio(DARK_TOKENS.borderInput, DARK_TOKENS.bgSubtle) >= 3.0);

  for (const palette of [LIGHT_TOKENS, DARK_TOKENS]) {
    assert.ok(contrastRatio(palette.textSecondary, palette.bgSurface) >= 4.5);
    assert.ok(contrastRatio(palette.textPlaceholder, palette.bgSurface) >= 4.5);
    assert.ok(contrastRatio(palette.accentSoftInk, palette.accentSoft) >= 4.5);
    assert.ok(contrastRatio(palette.statusSuccessFg, palette.statusSuccessBg) >= 4.5);
    assert.ok(contrastRatio(palette.statusWarningFg, palette.statusWarningBg) >= 4.5);
    assert.ok(contrastRatio(palette.statusDangerFg, palette.statusDangerBg) >= 4.5);
  }
});

test("clampScore bounds scores cleanly between 0 and 100", () => {
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(135), 100);
  assert.equal(clampScore(88), 88);
  assert.equal(clampScore(Number.NaN), 0);
});

test("globals.css uses semantic variables without legacy html.light override hacks or purple hexes", () => {
  const css = fs.readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
  assert.match(css, /--bg-canvas:\s*243 241 236;/);
  assert.match(css, /--accent:\s*45 106 79;/);
  assert.match(css, /html\.dark\s*\{[\s\S]*--bg-canvas:\s*17 22 19;/);
  assert.doesNotMatch(css, /#7c3aed/i);
  assert.doesNotMatch(css, /html\.light\s+\.text-white/);
  assert.doesNotMatch(css, /radial-gradient/);
  assert.match(css, /\.surface-card\b/);
  assert.match(css, /\.surface-subtle\b/);
  assert.match(css, /\.input-field\b/);
  assert.match(css, /\.btn-primary\b/);
  assert.match(css, /\.btn-secondary\b/);
  assert.match(css, /\.btn-quiet\b/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("tailwind.config.ts exposes botanical font families and semantic colors without legacy brand hex", () => {
  const tw = fs.readFileSync(path.join(webRoot, "tailwind.config.ts"), "utf8");
  assert.doesNotMatch(tw, /#7c3aed/i);
  assert.match(tw, /display:\s*\["var\(--font-display\)",\s*"sans-serif"\]/);
  assert.match(tw, /sans:\s*\["var\(--font-sans\)",\s*"sans-serif"\]/);
  assert.match(tw, /mono:\s*\["var\(--font-mono\)",\s*"monospace"\]/);
  assert.match(tw, /canvas:/);
  assert.match(tw, /surface:/);
  assert.match(tw, /hairline:/);
  assert.match(tw, /accent:/);
});

test("layout.tsx configures Google Fonts, Light Mode default THEME_INIT_SCRIPT, and accessible skip link", () => {
  const layout = fs.readFileSync(path.join(webRoot, "app/layout.tsx"), "utf8");
  assert.match(layout, /from\s*"next\/font\/google"/);
  assert.match(layout, /\bOutfit\b/);
  assert.match(layout, /\bPlus_Jakarta_Sans\b/);
  assert.match(layout, /\bIBM_Plex_Mono\b/);
  assert.match(layout, /--font-display/);
  assert.match(layout, /--font-sans/);
  assert.match(layout, /--font-mono/);
  assert.match(layout, /<html[\s\S]*className=\{`light /);
  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /<main[\s\S]*id="main-content"[\s\S]*tabIndex=\{-1\}/);
  assert.match(layout, /bg-canvas font-sans text-ink antialiased/);

  const scriptMatch = layout.match(/const THEME_INIT_SCRIPT\s*=\s*`([^`]+)`/);
  assert.ok(scriptMatch, "THEME_INIT_SCRIPT should be defined");

  function runInitScript(storedValue) {
    const classes = new Set(["dark"]);
    const root = {
      classList: {
        remove: (...items) => items.forEach((item) => classes.delete(item)),
        add: (...items) => items.forEach((item) => classes.add(item)),
      },
      style: { colorScheme: "" },
    };
    const sandbox = {
      localStorage: {
        getItem: (key) => (key === "careerscout-theme" ? storedValue : null),
      },
      document: { documentElement: root },
    };
    vm.runInNewContext(scriptMatch[1], sandbox);
    return { classes: [...classes], colorScheme: root.style.colorScheme };
  }

  assert.deepEqual(runInitScript(null), { classes: ["light"], colorScheme: "light" });
  assert.deepEqual(runInitScript("dark"), { classes: ["dark"], colorScheme: "dark" });
  assert.deepEqual(runInitScript("light"), { classes: ["light"], colorScheme: "light" });
});

test("providers.tsx defaults theme to light, reads careerscout-theme overrides, and uses semantic toast tokens", () => {
  const providers = fs.readFileSync(path.join(webRoot, "components/providers.tsx"), "utf8");
  assert.match(providers, /useState<Theme>\("light"\)/);
  assert.match(providers, /localStorage\.getItem\("careerscout-theme"\)/);
  assert.match(providers, /export function useTheme\(\)/);
  assert.match(providers, /export function useToast\(\)/);
  assert.match(providers, /export function Providers\(/);
  assert.match(providers, /--status-success-bg/);
  assert.match(providers, /--status-danger-bg/);
  assert.match(providers, /--bg-surface/);
  assert.match(providers, /--border-hairline/);
  assert.doesNotMatch(providers, /violet-|zinc-|emerald-|rose-/);
});

test("clampScore and scoreBand map ATS bands accurately", () => {
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(135), 100);
  assert.equal(scoreBand(91), "strong");
  assert.equal(scoreBand(80), "strong");
  assert.equal(scoreBand(72), "moderate");
  assert.equal(scoreBand(60), "moderate");
  assert.equal(scoreBand(48), "low");
  assert.equal(scoreBand(Number.NaN), "low");
});

test("Surface renders elevated, subtle, and hero variants with concentric radii", () => {
  const { Surface } = loadUiModule("components/ui/surface.tsx");

  const defaultHtml = renderToStaticMarkup(
    React.createElement(Surface, { "data-testid": "card" }, "Body"),
  );
  assert.match(defaultHtml, /bg-surface/);
  assert.match(defaultHtml, /border-hairline/);
  assert.match(defaultHtml, /shadow-botanical/);
  assert.match(defaultHtml, /rounded-2xl/);
  assert.match(defaultHtml, /data-testid="card"/);

  const subtleHtml = renderToStaticMarkup(
    React.createElement(Surface, { variant: "subtle", radius: "xl" }, "Well"),
  );
  assert.match(subtleHtml, /bg-subtle/);
  assert.doesNotMatch(subtleHtml, /shadow-botanical/);
  assert.match(subtleHtml, /rounded-xl/);

  const heroHtml = renderToStaticMarkup(
    React.createElement(Surface, { variant: "hero", radius: "3xl", className: "p-8" }, "Hero"),
  );
  assert.match(heroHtml, /rounded-3xl/);
  assert.match(heroHtml, /shadow-botanical/);
  assert.match(heroHtml, /p-8/);
});

test("Button renders accessible 44px mobile touch targets, focus rings, variants, and loading state", () => {
  const { Button } = loadUiModule("components/ui/button.tsx");

  const primaryHtml = renderToStaticMarkup(React.createElement(Button, null, "Explore Role"));
  assert.match(primaryHtml, /type="button"/);
  assert.match(primaryHtml, /rounded-full/);
  assert.match(primaryHtml, /bg-accent/);
  assert.match(primaryHtml, /min-h-\[44px\]/);
  assert.match(primaryHtml, /sm:min-h-\[40px\]/);
  assert.match(primaryHtml, /focus-visible:ring-2/);

  const smDangerHtml = renderToStaticMarkup(
    React.createElement(Button, { variant: "danger", size: "sm", loading: true }, "Remove"),
  );
  assert.match(smDangerHtml, /min-h-\[44px\]/);
  assert.match(smDangerHtml, /sm:min-h-\[36px\]/);
  assert.match(smDangerHtml, /bg-status-danger-bg/);
  assert.match(smDangerHtml, /disabled=""/);
  assert.match(smDangerHtml, /aria-busy="true"/);
  assert.match(smDangerHtml, /<svg[^>]*aria-hidden="true"/);
});

test("Badge renders semantic pill tones without ALL-CAPS transformation", () => {
  const { Badge } = loadUiModule("components/ui/badge.tsx");

  for (const [tone, expectedToken] of [
    ["neutral", "--bg-subtle"],
    ["accent", "--accent-soft"],
    ["success", "--status-success-bg"],
    ["warning", "--status-warning-bg"],
    ["danger", "--status-danger-bg"],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Badge, { tone }, tone));
    assert.match(html, /rounded-full/);
    assert.ok(html.includes(expectedToken), `Expected ${tone} badge to reference ${expectedToken}`);
    assert.doesNotMatch(html, /\buppercase\b/);
  }
});

test("ScoreRing computes SVG strokeDashoffset math, clamps values, and maps semantic band colors", () => {
  const { ScoreRing } = loadUiModule("components/ui/score-ring.tsx");

  const strongHtml = renderToStaticMarkup(
    React.createElement(ScoreRing, { score: 91, label: "Strong Fit", size: "lg" }),
  );
  assert.match(strongHtml, /role="meter"/);
  assert.match(strongHtml, /aria-valuenow="91"/);
  assert.match(strongHtml, /aria-valuemin="0"/);
  assert.match(strongHtml, /aria-valuemax="100"/);
  assert.match(strongHtml, /tabular-nums/);
  assert.match(strongHtml, /font-mono/);
  assert.match(strongHtml, /stroke="rgb\(var\(--accent\)\)"/);
  assert.match(strongHtml, /Strong Fit/);
  assert.match(strongHtml, />91</);
  assert.match(strongHtml, />\/100</);

  const moderateHtml = renderToStaticMarkup(React.createElement(ScoreRing, { score: 72 }));
  assert.match(moderateHtml, /stroke="rgb\(var\(--text-secondary\)\)"/);

  const roundedBoundaryHtml = renderToStaticMarkup(React.createElement(ScoreRing, { score: 79.6 }));
  assert.match(roundedBoundaryHtml, /aria-valuenow="80"/);
  assert.match(roundedBoundaryHtml, /stroke="rgb\(var\(--accent\)\)"/);

  const lowHtml = renderToStaticMarkup(React.createElement(ScoreRing, { score: 48, size: "sm" }));
  assert.match(lowHtml, /stroke="rgb\(var\(--status-warning-fg\)\)"/);
  assert.doesNotMatch(lowHtml, />\/100</);

  const zeroHtml = renderToStaticMarkup(React.createElement(ScoreRing, { score: -10 }));
  assert.match(zeroHtml, /aria-valuenow="0"/);
  assert.match(zeroHtml, /stroke-opacity="0"/);

  const fullHtml = renderToStaticMarkup(React.createElement(ScoreRing, { score: 135 }));
  assert.match(fullHtml, /aria-valuenow="100"/);
  assert.match(fullHtml, /stroke-dashoffset="0"/);
});

test("SectionState renders geometric loading skeletons, role=alert error with Retry, and empty guidance", () => {
  const { SectionState } = loadUiModule("components/ui/section-state.tsx");

  const loadingHtml = renderToStaticMarkup(
    React.createElement(SectionState, {
      status: "loading",
      title: "Loading matches",
      skeletonLines: 4,
    }),
  );
  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Loading matches/);
  const lineMatches = loadingHtml.match(/h-4 rounded-md bg-subtle/g) ?? [];
  assert.equal(lineMatches.length, 4);

  const errorHtml = renderToStaticMarkup(
    React.createElement(SectionState, {
      status: "error",
      title: "Unable to reach matching service",
      description: "Check your connection and try again.",
      onRetry: () => {},
    }),
  );
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Unable to reach matching service/);
  assert.match(errorHtml, /Check your connection and try again\./);
  assert.match(errorHtml, />Retry</);

  const emptyHtml = renderToStaticMarkup(
    React.createElement(SectionState, {
      status: "empty",
      title: "No primary CV uploaded",
      description: "Upload a resume to unlock ATS scoring.",
      action: React.createElement("a", { href: "/cvs" }, "Upload CV"),
    }),
  );
  assert.match(emptyHtml, /No primary CV uploaded/);
  assert.match(emptyHtml, /Upload a resume to unlock ATS scoring\./);
  assert.match(emptyHtml, /href="\/cvs"/);
});

test("MotionReveal honors useReducedMotion and limits animation to opacity and y in 150-220ms", () => {
  const realFramer = webRequire("framer-motion");

  const reducedMod = loadUiModule("components/ui/motion-reveal.tsx", {
    "framer-motion": { ...realFramer, useReducedMotion: () => true },
  });
  const reducedHtml = renderToStaticMarkup(
    React.createElement(reducedMod.MotionReveal, { delay: 0.1, className: "card" }, "Visible"),
  );
  assert.equal(reducedHtml, '<div class="card">Visible</div>');

  const activeMod = loadUiModule("components/ui/motion-reveal.tsx", {
    "framer-motion": { ...realFramer, useReducedMotion: () => false },
  });
  const activeHtml = renderToStaticMarkup(
    React.createElement(activeMod.MotionReveal, { delay: 0.05 }, "Animated"),
  );
  assert.match(activeHtml, /opacity:\s*0/);
  assert.match(activeHtml, /translateY\(8px\)/);

  const src = fs.readFileSync(path.join(webRoot, "components/ui/motion-reveal.tsx"), "utf8");
  assert.match(src, /useReducedMotion\(\)/);
  assert.match(src, /duration:\s*0\.(1[5-9]|2[0-2]?)\b/);
});

test("UI primitives avoid banned colors, lucide imports, and emoji icons", () => {
  const uiDir = path.join(webRoot, "components/ui");
  const files = fs.readdirSync(uiDir).filter((name) => name.endsWith(".tsx"));
  assert.deepEqual(files.sort(), [
    "badge.tsx",
    "button.tsx",
    "motion-reveal.tsx",
    "score-ring.tsx",
    "section-state.tsx",
    "surface.tsx",
  ]);

  for (const file of files) {
    const content = fs.readFileSync(path.join(uiDir, file), "utf8");
    assert.doesNotMatch(
      content,
      /bg-white|text-white|text-black|violet-|indigo-|purple-|radial-gradient/,
    );
    assert.doesNotMatch(content, /lucide-react/);
    assert.doesNotMatch(content, /[\u{1F300}-\u{1FAFF}\u2713\u25B3]/u);
  }
});

test("navbar.tsx satisfies Nordic Botanical floating capsule markup, routes, and token bans", () => {
  const src = fs.readFileSync(path.join(webRoot, "components/navbar.tsx"), "utf8");

  assert.match(src, /data-testid="theme-toggle"/);
  assert.match(src, /data-testid="theme-toggle-mobile"/);

  for (const route of [
    "/dashboard",
    "/jobs",
    "/saved-jobs",
    "/cvs",
    "/ai-insights",
    "/ai-chat",
    "/analytics",
    "/email-settings",
    "/profile-settings",
    "/onboarding",
    "/admin",
  ]) {
    assert.ok(src.includes(`"${route}"`), `Expected navbar.tsx to include route ${route}`);
  }

  for (const label of [
    "Overview",
    "Roles",
    "Saved",
    "CVs",
    "Insights",
    "AI Coach",
    "Analytics",
    "Email Digest",
    "Profile Settings",
    "Onboarding",
    "Admin",
  ]) {
    assert.ok(src.includes(`"${label}"`), `Expected navbar.tsx to include label ${label}`);
  }

  assert.match(src, /bg-surface\/90/);
  assert.match(src, /backdrop-blur-md/);
  assert.match(src, /border-hairline/);
  assert.match(src, /shadow-botanical/);
  assert.match(src, /bg-accent-soft/);
  assert.match(src, /text-accent-soft-ink/);
  assert.match(src, /aria-expanded=\{moreOpen\}/);
  assert.match(src, /pointerdown/);
  assert.match(src, /Escape/);
  assert.match(src, /role="dialog"/);
  assert.match(src, /min-h-\[44px\]/);

  assert.doesNotMatch(
    src,
    /shadow-violet|text-amber-300|bg-brand|bg-white|text-white|text-black|violet-|indigo-|purple-|emerald-|rose-|amber-|zinc-|data-preserve-white|\bglass\b|#7c3aed|lucide-react/,
  );
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u2713\u25B3]/u);
});

test("Navbar renders floating capsule, active pill, theme toggles, and onboarding dot across auth states", () => {
  const renderNavbar = ({ pathname = "/jobs", theme = "light", user = null } = {}) => {
    const { Navbar } = loadUiModule("components/navbar.tsx", {
      "next/link": {
        __esModule: true,
        default: ({ href, children, ...props }) =>
          React.createElement("a", { href, ...props }, children),
      },
      "next/navigation": {
        usePathname: () => pathname,
        useRouter: () => ({ push: () => {} }),
      },
      "@/lib/api": {
        apiFetch: async () => ({}),
      },
      "@/store/auth-store": {
        useAuthStore: () => ({
          user,
          refreshToken: null,
          setSession: () => {},
          clearSession: () => {},
        }),
      },
      "./providers": {
        useTheme: () => ({ theme, toggleTheme: () => {} }),
        useToast: () => ({ pushToast: () => {} }),
      },
    });
    return renderToStaticMarkup(React.createElement(Navbar));
  };

  const guestHtml = renderNavbar({ pathname: "/jobs", theme: "light", user: null });
  assert.match(guestHtml, /CareerScout/);
  assert.match(guestHtml, /data-testid="theme-toggle"/);
  assert.match(guestHtml, /data-testid="theme-toggle-mobile"/);
  assert.match(guestHtml, /min-h-\[40px\] min-w-\[40px\]/);
  assert.match(guestHtml, /h-11 w-11/);
  assert.match(guestHtml, /aria-expanded="false"/);
  assert.match(guestHtml, /href="\/jobs"[^>]*aria-current="page"[^>]*bg-accent-soft/);
  assert.match(guestHtml, /Try Demo/);
  assert.match(guestHtml, /href="\/auth\/login"[^>]*>Sign in</);
  assert.match(guestHtml, /href="\/auth\/register"[^>]*>Get Started</);

  const onboardingUserHtml = renderNavbar({
    pathname: "/dashboard",
    theme: "dark",
    user: {
      id: 1,
      email: "ada@example.com",
      full_name: "Ada Lovelace",
      role: "user",
      onboarding_completed: false,
    },
  });
  assert.match(onboardingUserHtml, /Ada Lovelace/);
  assert.match(onboardingUserHtml, /Sign out/);
  assert.match(onboardingUserHtml, /Onboarding incomplete/);
  assert.match(onboardingUserHtml, /Switch to light mode/);
  assert.doesNotMatch(onboardingUserHtml, /Try Demo/);
});

test("Sidebar is retired to a clean null-returning compatibility stub", () => {
  const src = fs.readFileSync(path.join(webRoot, "components/sidebar.tsx"), "utf8");
  assert.doesNotMatch(
    src,
    /\bglass\b|violet-|amber-|bg-brand|zinc-|text-white|bg-white|lucide-react/,
  );

  const { Sidebar } = loadUiModule("components/sidebar.tsx");
  const html = renderToStaticMarkup(React.createElement(Sidebar));
  assert.equal(html, "");
});
