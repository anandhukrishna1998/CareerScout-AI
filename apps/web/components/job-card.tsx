"use client";

import Link from "next/link";
import { Badge } from "./ui/badge";
import { ScoreRing } from "./ui/score-ring";
import { Surface } from "./ui/surface";
import { clampScore } from "@/lib/theme-tokens";

export type JobCardProps = {
  id?: number;
  title: string;
  company: string;
  location: string;
  score: number | null;
  remote: string;
  source?: string;
  salaryText?: string;
  postedAt?: string;
  applyUrl?: string;
  skills?: string[];
  isSaved?: boolean;
  onToggleSave?: (jobId: number, currentlySaved: boolean) => void;
};

function formatRelativeDate(iso?: string): string {
  if (!iso) return "";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSafeExternalUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

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
      className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover/link:translate-x-0.5"
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

function ExternalArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function JobCard({
  id,
  title,
  company,
  location,
  score,
  remote,
  source,
  salaryText,
  postedAt,
  applyUrl,
  skills = [],
  isSaved = false,
  onToggleSave,
}: JobCardProps) {
  const hasId = typeof id === "number" && Number.isFinite(id);
  const detailsHref = hasId ? (`/jobs/${id}` as `/jobs/${number}`) : ("/jobs" as const);
  const relativeDate = formatRelativeDate(postedAt);
  const hasScore = score !== null && score !== undefined && Number.isFinite(score);
  const roundedScore = hasScore ? Math.round(clampScore(score)) : null;
  const visibleSkills = skills.slice(0, 5);
  const safeApplyUrl = getSafeExternalUrl(applyUrl);

  return (
    <article className="h-full">
      <Surface
        variant="elevated"
        radius="2xl"
        className="flex h-full flex-col justify-between gap-4 p-5 transition-colors duration-150 hover:border-accent/40"
      >
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="min-w-0">
                <Link
                  href={detailsHref}
                  className="inline-flex min-h-[44px] max-w-full items-center rounded-md text-base font-semibold text-ink transition-colors duration-150 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-0"
                >
                  <span className="truncate">{title}</span>
                </Link>
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-secondary">
                <span className="max-w-full truncate">{company}</span>
                {relativeDate && (
                  <>
                    <span aria-hidden="true" className="text-muted">
                      ·
                    </span>
                    <time
                      dateTime={postedAt}
                      className="font-mono text-xs font-medium tabular-nums text-muted"
                    >
                      {relativeDate}
                    </time>
                  </>
                )}
              </div>
            </div>

            {roundedScore !== null ? (
              <ScoreRing score={roundedScore} size="sm" className="shrink-0" />
            ) : (
              <Badge tone="neutral" className="shrink-0 font-mono tabular-nums">
                No CV
              </Badge>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
            {location && <span className="text-muted">{location}</span>}
            {remote && (
              <Badge tone="neutral" className="capitalize">
                {remote}
              </Badge>
            )}
            {source && <Badge tone="neutral">{source}</Badge>}
            {salaryText && (
              <Badge tone="success" className="font-mono tabular-nums">
                {salaryText}
              </Badge>
            )}
          </div>

          {visibleSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visibleSkills.map((sk, idx) => (
                <span
                  key={`${sk}-${idx}`}
                  className="rounded-full border border-hairline bg-subtle px-2.5 py-0.5 text-xs font-medium text-ink-secondary"
                >
                  {sk}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3.5">
          <Link
            href={detailsHref}
            className="group/link inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-accent-text transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[38px]"
          >
            <span>View ATS Analysis</span>
            <ArrowRightIcon />
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {hasId && onToggleSave && (
              <button
                type="button"
                aria-pressed={isSaved}
                aria-label={isSaved ? `Remove ${title} from saved jobs` : `Save ${title}`}
                onClick={() => onToggleSave(id as number, isSaved)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[38px] ${
                  isSaved
                    ? "border-[rgb(var(--accent)/0.3)] bg-accent-soft text-accent-soft-ink hover:bg-hover"
                    : "border-hairline bg-subtle text-ink hover:bg-hover"
                }`}
              >
                {isSaved && <CheckIcon />}
                <span>{isSaved ? "Saved" : "Save"}</span>
              </button>
            )}
            {safeApplyUrl && (
              <a
                href={safeApplyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Apply to ${title} at ${company} (opens in new tab)`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-ink transition duration-150 hover:-translate-y-[1px] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[38px]"
              >
                <span>Apply</span>
                <ExternalArrowIcon />
              </a>
            )}
          </div>
        </div>
      </Surface>
    </article>
  );
}
