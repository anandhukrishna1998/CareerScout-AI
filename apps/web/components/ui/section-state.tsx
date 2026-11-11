import clsx from "clsx";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Surface } from "./surface";

export type SectionStateStatus = "loading" | "error" | "empty";

export interface SectionStateProps {
  status: SectionStateStatus;
  title: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  skeletonLines?: number;
  className?: string;
}

const SKELETON_WIDTHS = ["w-full", "w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-4/5"];

export function SectionState({
  status,
  title,
  description,
  onRetry,
  action,
  skeletonLines = 3,
  className,
}: SectionStateProps) {
  if (status === "loading") {
    const lineCount = Number.isFinite(skeletonLines)
      ? Math.max(1, Math.min(8, Math.floor(skeletonLines)))
      : 3;
    return (
      <Surface
        variant="elevated"
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={clsx("p-6", className)}
      >
        <span className="sr-only">
          {title}
          {description ? ` — ${description}` : ""}
        </span>
        <div aria-hidden="true" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-5 w-44 rounded-lg bg-subtle motion-safe:animate-pulse" />
            <div className="h-6 w-20 rounded-full bg-subtle motion-safe:animate-pulse" />
          </div>
          <div className="space-y-2.5 pt-1">
            {Array.from({ length: lineCount }).map((_, index) => (
              <div
                key={index}
                className={clsx(
                  "h-4 rounded-md bg-subtle motion-safe:animate-pulse",
                  SKELETON_WIDTHS[index % SKELETON_WIDTHS.length],
                )}
              />
            ))}
          </div>
        </div>
      </Surface>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className={clsx(
          "rounded-2xl border border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] p-6 shadow-botanical",
          className,
        )}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--status-danger-border))] bg-surface text-[rgb(var(--status-danger-fg))]"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">{title}</p>
            {description && (
              <p className="mt-1 max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
                {description}
              </p>
            )}
            {(onRetry || action) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {onRetry && (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    Retry
                  </Button>
                )}
                {action}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Surface variant="elevated" className={clsx("p-6 md:p-7", className)}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-subtle text-ink-secondary"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <path d="M4 16l3.2-8.2A2 2 0 0 1 9.06 6.5h5.88a2 2 0 0 1 1.86 1.3L20 16" />
            <path d="M4 16h4.5l1.5 2h4l1.5-2H20" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink">{title}</p>
          {description && (
            <p className="mt-1 max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
              {description}
            </p>
          )}
          {(action || onRetry) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {action}
              {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}
