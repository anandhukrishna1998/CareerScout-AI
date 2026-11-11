import { Badge } from "./ui/badge";
import { ScoreRing } from "./ui/score-ring";
import { Surface } from "./ui/surface";
import { clampScore, scoreBand } from "@/lib/theme-tokens";

export type MatchScoreCardProps = {
  score: number;
  strengths: string[];
  missing: string[];
  skillScore?: number;
  semanticScore?: number;
  experienceScore?: number;
  recommendation?: string;
  actionItems?: string[];
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function MatchScoreCard({
  score,
  strengths,
  missing,
  skillScore,
  semanticScore,
  experienceScore,
  recommendation,
  actionItems = [],
}: MatchScoreCardProps) {
  const safeScore = Math.round(clampScore(score));
  const band = scoreBand(safeScore);
  const bandLabel =
    band === "strong" ? "Strong Fit" : band === "moderate" ? "Good Fit" : "Developing Fit";
  const bandTone = band === "strong" ? "success" : band === "moderate" ? "neutral" : "warning";
  const hasBreakdown =
    skillScore !== undefined || semanticScore !== undefined || experienceScore !== undefined;

  return (
    <section aria-label="ATS Match Score">
      <Surface variant="elevated" radius="2xl" className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                ATS Match Score
              </h2>
              <Badge tone={bandTone}>{bandLabel}</Badge>
            </div>
            {recommendation ? (
              <p className="mt-2 max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
                {recommendation}
              </p>
            ) : (
              <p className="mt-2 max-w-[65ch] text-sm leading-[1.55] text-muted">
                Evaluated across skill overlap, semantic fit, and seniority alignment.
              </p>
            )}
          </div>
          <ScoreRing score={safeScore} size="md" className="shrink-0" />
        </div>

        {hasBreakdown && (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-hairline py-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Skills</span>
              <span className="font-mono font-semibold tabular-nums text-ink">
                {skillScore ?? 0}/60
              </span>
            </div>
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Semantic</span>
              <span className="font-mono font-semibold tabular-nums text-ink">
                {semanticScore ?? 0}/25
              </span>
            </div>
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Exp</span>
              <span className="font-mono font-semibold tabular-nums text-ink">
                {experienceScore ?? 0}/15
              </span>
            </div>
          </div>
        )}

        <div className="mt-5">
          <h3 className="mb-2.5 text-xs font-medium text-muted">Matched strengths</h3>
          {strengths.length > 0 ? (
            <ul className="space-y-2 text-sm text-ink-secondary">
              {strengths.map((s) => (
                <li key={s} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink"
                  >
                    <CheckIcon />
                  </span>
                  <span className="leading-[1.5] text-ink">{s}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-[1.55] text-muted">
              Upload a CV or add skills in Profile to view matched strengths.
            </p>
          )}
        </div>

        <div className="mt-5">
          <h3 className="mb-2.5 text-xs font-medium text-muted">Missing skills</h3>
          {missing.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Badge key={m} tone="warning">
                  {m}
                </Badge>
              ))}
            </div>
          ) : (
            <Badge tone="success">
              <CheckIcon />
              <span>No major missing skills detected</span>
            </Badge>
          )}
        </div>

        {actionItems.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <h3 className="mb-2.5 text-xs font-medium text-muted">Action plan</h3>
            <ul className="space-y-2 text-xs leading-[1.55] text-ink-secondary">
              {actionItems.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <ArrowRightIcon />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Surface>
    </section>
  );
}
