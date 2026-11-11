import clsx from "clsx";
import { clampScore, scoreBand, type ScoreBand } from "@/lib/theme-tokens";

export type ScoreRingSize = "sm" | "md" | "lg";

export interface ScoreRingProps {
  score: number;
  label?: string;
  size?: ScoreRingSize;
  className?: string;
}

const SIZE_CONFIG: Record<
  ScoreRingSize,
  {
    boxSize: number;
    strokeWidth: number;
    containerClass: string;
    valueClass: string;
    unitClass: string;
    showUnit: boolean;
  }
> = {
  sm: {
    boxSize: 56,
    strokeWidth: 5,
    containerClass: "h-14 w-14",
    valueClass: "text-sm",
    unitClass: "text-[9px]",
    showUnit: false,
  },
  md: {
    boxSize: 84,
    strokeWidth: 6.5,
    containerClass: "h-[84px] w-[84px]",
    valueClass: "text-xl",
    unitClass: "text-[10px]",
    showUnit: true,
  },
  lg: {
    boxSize: 112,
    strokeWidth: 8,
    containerClass: "h-28 w-28",
    valueClass: "text-2xl",
    unitClass: "text-[11px]",
    showUnit: true,
  },
};

const BAND_STROKE: Record<ScoreBand, string> = {
  strong: "rgb(var(--accent))",
  moderate: "rgb(var(--text-secondary))",
  low: "rgb(var(--status-warning-fg))",
};

export function ScoreRing({ score, label, size = "md", className }: ScoreRingProps) {
  const safeScore = clampScore(score);
  const roundedScore = Math.round(safeScore);
  const band = scoreBand(roundedScore);
  const config = SIZE_CONFIG[size];

  const center = config.boxSize / 2;
  const radius = (config.boxSize - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeScore / 100) * circumference;

  return (
    <div className={clsx("inline-flex flex-col items-center gap-1.5", className)}>
      <div
        role="meter"
        aria-valuenow={roundedScore}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label} score` : "ATS match score"}
        className={clsx(
          "relative inline-flex shrink-0 items-center justify-center",
          config.containerClass,
        )}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${config.boxSize} ${config.boxSize}`}
          className="h-full w-full"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgb(var(--bg-subtle))"
            strokeWidth={config.strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeOpacity={safeScore > 0 ? 1 : 0}
            transform={`rotate(-90 ${center} ${center})`}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={clsx(
              "font-mono font-semibold tabular-nums leading-none text-ink",
              config.valueClass,
            )}
          >
            {roundedScore}
          </span>
          {config.showUnit && (
            <span
              className={clsx(
                "mt-0.5 font-mono tabular-nums leading-none text-muted",
                config.unitClass,
              )}
            >
              /100
            </span>
          )}
        </div>
      </div>
      {label && <span className="text-center text-xs font-medium text-muted">{label}</span>}
    </div>
  );
}
