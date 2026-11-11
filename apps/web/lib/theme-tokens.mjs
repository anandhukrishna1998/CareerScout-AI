/**
 * Nordic Botanical Atelier (Option 3) dual-theme semantic tokens and contrast helpers.
 * Single source of truth mirroring DESIGN.md Section 2.
 */

export const LIGHT_TOKENS = Object.freeze({
  bgCanvas: "#F3F1EC",
  bgSurface: "#FCFBF8",
  bgSubtle: "#EBE7DE",
  bgHover: "#E2DDD2",
  borderHairline: "#E2DFD6",
  borderInput: "#7A827B",
  textPrimary: "#1B201C",
  textSecondary: "#3F4741",
  textMuted: "#59615B",
  textPlaceholder: "#5D655F",
  accent: "#2D6A4F",
  accentHover: "#23533D",
  accentInk: "#FFFFFF",
  accentText: "#2D6A4F",
  accentSoft: "#E6EFEA",
  accentSoftInk: "#1F4E3A",
  statusSuccessFg: "#1E563B",
  statusSuccessBg: "#E5EFE9",
  statusSuccessBorder: "#B9D4C5",
  statusWarningFg: "#8A5311",
  statusWarningBg: "#F6EFE1",
  statusWarningBorder: "#E0C99F",
  statusDangerFg: "#9F2D2D",
  statusDangerBg: "#F8E8E8",
  statusDangerBorder: "#DFB4B4",
});

export const DARK_TOKENS = Object.freeze({
  bgCanvas: "#111613",
  bgSurface: "#19201C",
  bgSubtle: "#222B26",
  bgHover: "#2A352F",
  borderHairline: "#2B3730",
  borderInput: "#6B7B71",
  textPrimary: "#EBF0EC",
  textSecondary: "#C4CEC7",
  textMuted: "#9BA69F",
  textPlaceholder: "#8F9C94",
  accent: "#52B788",
  accentHover: "#64C698",
  accentInk: "#0D1712",
  accentText: "#6CD0A0",
  accentSoft: "#1D3328",
  accentSoftInk: "#8EE0B8",
  statusSuccessFg: "#7CD9AB",
  statusSuccessBg: "#182F23",
  statusSuccessBorder: "#2F5C45",
  statusWarningFg: "#E6B86A",
  statusWarningBg: "#2D2516",
  statusWarningBorder: "#5C4924",
  statusDangerFg: "#F29B9B",
  statusDangerBg: "#311B1C",
  statusDangerBorder: "#663437",
});

function parseHexRgb(hex) {
  if (typeof hex !== "string") {
    throw new TypeError(`Expected hex color string, received ${typeof hex}`);
  }
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex) {
  const [r, g, b] = parseHexRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function clampScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, score));
}

export function scoreBand(score) {
  const safe = clampScore(score);
  if (safe >= 80) return "strong";
  if (safe >= 60) return "moderate";
  return "low";
}
