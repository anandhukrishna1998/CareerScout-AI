import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { LIGHT_TOKENS, DARK_TOKENS, contrastRatio, clampScore } from "../lib/theme-tokens.mjs";

const webRoot = path.resolve(import.meta.dirname, "..");

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
