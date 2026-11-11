"use client";

import { useId, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";

export type JobFiltersState = {
  q: string;
  country: string;
  city: string;
  technologies: string;
  remote_mode: string;
  source: string;
  posting_age_hours: number;
  min_score: number;
  sort: string;
};

export type FilterPanelProps = {
  filters: JobFiltersState;
  availableSources?: string[];
  availableCountries?: string[];
  onChange: (next: JobFiltersState) => void;
  onReset: () => void;
  onRetry?: () => void;
};

const QUICK_COUNTRIES = [
  { label: "All", value: "" },
  { label: "France", value: "France" },
  { label: "Germany", value: "Germany" },
  { label: "USA", value: "United States" },
  { label: "UK", value: "United Kingdom" },
  { label: "Worldwide", value: "Worldwide" },
];

function countActiveFilters(filters: JobFiltersState): number {
  let count = 0;
  if (filters.q.trim()) count += 1;
  if (filters.country.trim()) count += 1;
  if (filters.city.trim()) count += 1;
  if (filters.technologies.trim()) count += 1;
  if (filters.remote_mode !== "all") count += 1;
  if (filters.source !== "all") count += 1;
  if (filters.posting_age_hours > 0) count += 1;
  if (filters.min_score > 0) count += 1;
  return count;
}

function SlidersIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-accent-text"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="2.5" fill="rgb(var(--bg-surface))" />
      <circle cx="15" cy="17" r="2.5" fill="rgb(var(--bg-surface))" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function FilterPanel({
  filters,
  availableSources = [],
  availableCountries = [],
  onChange,
  onReset,
  onRetry,
}: FilterPanelProps) {
  const uid = useId();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const update = <K extends keyof JobFiltersState>(key: K, value: JobFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount = countActiveFilters(filters);
  const canReset = activeCount > 0 || filters.sort !== "newest";

  const countrySuggestions = Array.from(
    new Set([
      ...availableCountries,
      "France",
      "Germany",
      "United Kingdom",
      "United States",
      "Canada",
      "Switzerland",
      "India",
      "Worldwide",
    ]),
  ).sort();

  const panelContentId = `${uid}-panel-fields`;
  const countryDatalistId = `${uid}-country-options`;

  return (
    <aside aria-label="Job filters" className="h-fit lg:sticky lg:top-24">
      <Surface variant="elevated" radius="2xl" className="p-5">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            aria-expanded={mobileExpanded}
            aria-controls={panelContentId}
            onClick={() => setMobileExpanded((prev) => !prev)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-between gap-2 rounded-xl px-1 py-1.5 text-left text-sm font-semibold text-ink transition-colors duration-150 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersIcon />
              <span className="font-display text-base font-semibold tracking-[-0.015em]">
                Filters
              </span>
              <Badge
                tone={activeCount > 0 ? "accent" : "neutral"}
                className="font-mono tabular-nums"
              >
                {activeCount}
              </Badge>
            </span>
            <ChevronIcon open={mobileExpanded} />
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium text-accent-text transition-colors duration-150 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Reset
          </button>
        </div>

        <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold tracking-[-0.015em] text-ink">
              Filters
            </h2>
            {activeCount > 0 && (
              <Badge tone="accent" className="font-mono tabular-nums">
                {activeCount}
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="inline-flex min-h-[36px] items-center justify-center rounded-full px-3 py-1 text-xs font-medium text-accent-text transition-colors duration-150 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Reset
          </button>
        </div>

        <div
          id={panelContentId}
          className={
            mobileExpanded
              ? "mt-4 block space-y-4 border-t border-hairline pt-4 lg:mt-4 lg:block"
              : "hidden space-y-4 border-t border-hairline pt-4 lg:mt-4 lg:block"
          }
        >
          <div>
            <label htmlFor={`${uid}-q`} className="mb-1.5 block text-xs font-medium text-muted">
              Keyword / Role
            </label>
            <input
              id={`${uid}-q`}
              type="search"
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
              placeholder="AI Engineer, RAG, Python..."
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-country`}
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Country
            </label>
            <input
              id={`${uid}-country`}
              list={countryDatalistId}
              value={filters.country}
              onChange={(e) => update("country", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
              placeholder="France, Germany, USA, Worldwide..."
            />
            <datalist id={countryDatalistId}>
              {countrySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_COUNTRIES.map((qc) => {
                const active =
                  (qc.value === "" && !filters.country.trim()) ||
                  filters.country.trim().toLowerCase() === qc.value.toLowerCase();
                return (
                  <button
                    key={qc.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update("country", qc.value)}
                    className={`inline-flex min-h-[44px] items-center rounded-full border px-3 py-1 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[32px] sm:px-2.5 sm:text-[11px] ${
                      active
                        ? "border-[rgb(var(--accent)/0.3)] bg-accent-soft text-accent-soft-ink"
                        : "border-hairline bg-subtle text-ink-secondary hover:bg-hover hover:text-ink"
                    }`}
                  >
                    {qc.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-city`} className="mb-1.5 block text-xs font-medium text-muted">
              City
            </label>
            <input
              id={`${uid}-city`}
              type="text"
              value={filters.city}
              onChange={(e) => update("city", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
              placeholder="Paris, Lyon, Remote..."
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-technologies`}
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Technologies (comma-separated)
            </label>
            <input
              id={`${uid}-technologies`}
              type="text"
              value={filters.technologies}
              onChange={(e) => update("technologies", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
              placeholder="Python, LLM, FastAPI"
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-remote`}
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Work Mode
            </label>
            <select
              id={`${uid}-remote`}
              value={filters.remote_mode}
              onChange={(e) => update("remote_mode", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
            >
              <option value="all">All modes</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>

          <div>
            <label
              htmlFor={`${uid}-source`}
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Source
            </label>
            <select
              id={`${uid}-source`}
              value={filters.source}
              onChange={(e) => update("source", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
            >
              <option value="all">All sources</option>
              {availableSources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${uid}-age`} className="mb-1.5 block text-xs font-medium text-muted">
              Posted Within
            </label>
            <select
              id={`${uid}-age`}
              value={filters.posting_age_hours}
              onChange={(e) => update("posting_age_hours", Number(e.target.value))}
              className="input-field min-h-[44px] sm:min-h-[42px]"
            >
              <option value={0}>Any time</option>
              <option value={24}>Last 24 hours</option>
              <option value={72}>Last 3 days</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label htmlFor={`${uid}-min-score`} className="font-medium text-muted">
                Minimum ATS Score
              </label>
              <span className="font-mono font-semibold tabular-nums text-accent-text">
                {filters.min_score}%
              </span>
            </div>
            <input
              id={`${uid}-min-score`}
              type="range"
              min={0}
              max={90}
              step={5}
              value={filters.min_score}
              onChange={(e) => update("min_score", Number(e.target.value))}
              className="h-7 w-full cursor-pointer accent-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label htmlFor={`${uid}-sort`} className="mb-1.5 block text-xs font-medium text-muted">
              Sort By
            </label>
            <select
              id={`${uid}-sort`}
              value={filters.sort}
              onChange={(e) => update("sort", e.target.value)}
              className="input-field min-h-[44px] sm:min-h-[42px]"
            >
              <option value="newest">Newest first</option>
              <option value="score">Highest ATS match</option>
              <option value="company">Company A-Z</option>
            </select>
          </div>

          {onRetry && (
            <div className="border-t border-hairline pt-3">
              <Button variant="secondary" size="sm" onClick={onRetry} className="w-full">
                Retry
              </Button>
            </div>
          )}
        </div>
      </Surface>
    </aside>
  );
}
