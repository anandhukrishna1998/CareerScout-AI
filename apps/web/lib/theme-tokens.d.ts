export interface SemanticTokenPalette {
  readonly bgCanvas: string;
  readonly bgSurface: string;
  readonly bgSubtle: string;
  readonly bgHover: string;
  readonly borderHairline: string;
  readonly borderInput: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textPlaceholder: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentInk: string;
  readonly accentText: string;
  readonly accentSoft: string;
  readonly accentSoftInk: string;
  readonly statusSuccessFg: string;
  readonly statusSuccessBg: string;
  readonly statusSuccessBorder: string;
  readonly statusWarningFg: string;
  readonly statusWarningBg: string;
  readonly statusWarningBorder: string;
  readonly statusDangerFg: string;
  readonly statusDangerBg: string;
  readonly statusDangerBorder: string;
}

export type ScoreBand = "strong" | "moderate" | "low";

export declare const LIGHT_TOKENS: Readonly<SemanticTokenPalette>;
export declare const DARK_TOKENS: Readonly<SemanticTokenPalette>;
export declare function contrastRatio(hexA: string, hexB: string): number;
export declare function clampScore(score: number): number;
export declare function scoreBand(score: number): ScoreBand;
