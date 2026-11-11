"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FilterPanel, type JobFiltersState } from "@/components/filter-panel";
import { JobCard } from "@/components/job-card";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { apiFetch } from "@/lib/api";
import type { JobItem, JobListResponse } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

const DEFAULT_FILTERS: JobFiltersState = {
  q: "",
  country: "",
  city: "",
  technologies: "",
  remote_mode: "all",
  source: "all",
  posting_age_hours: 0,
  min_score: 0,
  sort: "newest",
};

function buildJobsQueryString(filters: JobFiltersState, targetPage: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.city.trim()) params.set("city", filters.city.trim());
  if (filters.technologies.trim()) params.set("technologies", filters.technologies.trim());
  if (filters.remote_mode !== "all") params.set("remote_mode", filters.remote_mode);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.posting_age_hours > 0) {
    params.set("posting_age_hours", String(filters.posting_age_hours));
  }
  if (filters.min_score > 0) params.set("min_score", String(filters.min_score));
  params.set("sort", filters.sort);
  params.set("page", String(targetPage));
  params.set("page_size", "12");
  return params.toString();
}

function JobExplorerContent() {
  const { pushToast } = useToast();
  const { accessToken } = useAuthStore();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<JobFiltersState>(() => {
    const sortParam = searchParams.get("sort");
    const qParam = searchParams.get("q");
    const remoteParam = searchParams.get("remote_mode");
    return {
      ...DEFAULT_FILTERS,
      q: qParam ?? DEFAULT_FILTERS.q,
      remote_mode:
        remoteParam && ["all", "remote", "hybrid", "onsite"].includes(remoteParam)
          ? remoteParam
          : DEFAULT_FILTERS.remote_mode,
      sort:
        sortParam && ["newest", "score", "company"].includes(sortParam)
          ? sortParam
          : DEFAULT_FILTERS.sort,
    };
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<JobListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipNextEffectKeyRef = useRef<string | null>(null);

  const loadJobs = useCallback(
    async (pageOverride?: number) => {
      const targetPage = typeof pageOverride === "number" ? pageOverride : page;
      const requestId = ++requestIdRef.current;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError("");
      try {
        const query = buildJobsQueryString(filters, targetPage);
        const res = await apiFetch<JobListResponse>(`/jobs?${query}`, {
          signal: controller.signal,
        });
        if (requestId !== requestIdRef.current) return;
        setData(res);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Failed to load jobs";
        setError(message);
        setData(null);
        pushToast(message, "error");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [filters, page, pushToast],
  );

  useEffect(() => {
    const currentKey = `${buildJobsQueryString(filters, page)}|${accessToken ?? ""}`;
    if (skipNextEffectKeyRef.current === currentKey) {
      skipNextEffectKeyRef.current = null;
      return;
    }
    skipNextEffectKeyRef.current = null;

    const timer = setTimeout(() => {
      void loadJobs();
    }, 220);
    return () => clearTimeout(timer);
  }, [filters, page, accessToken, loadJobs]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handleLiveIngest = async () => {
    if (!accessToken) {
      pushToast("Sign in (or click Try Demo) to fetch live jobs from external boards", "info");
      return;
    }
    setIngesting(true);
    try {
      const res = await apiFetch<{ total_ingested: number; query_used?: string }>("/jobs/ingest", {
        method: "POST",
        body: JSON.stringify({
          sources: [
            "remoteok",
            "arbeitnow",
            "remotive",
            "weworkremotely",
            "himalayas",
            "jobicy",
            "greenhouse",
            "ashby",
          ],
          query: filters.q,
          location: filters.country || filters.city,
          hours_old: filters.posting_age_hours > 0 ? filters.posting_age_hours : 720,
        }),
      });
      pushToast(`Fetched ${res.total_ingested} live jobs across public & ATS boards!`, "success");
      if (page !== 1) {
        skipNextEffectKeyRef.current = `${buildJobsQueryString(filters, 1)}|${accessToken ?? ""}`;
        setPage(1);
      }
      await loadJobs(1);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Live job search failed", "error");
    } finally {
      setIngesting(false);
    }
  };

  const handleToggleSave = async (jobId: number, currentlySaved: boolean) => {
    if (!accessToken) {
      pushToast("Sign in to save jobs to your tracker", "info");
      return;
    }
    try {
      if (currentlySaved) {
        await apiFetch(`/saved-jobs/${jobId}`, { method: "DELETE" });
        pushToast("Removed from saved jobs", "info");
      } else {
        await apiFetch("/saved-jobs", {
          method: "POST",
          body: JSON.stringify({ job_id: jobId, status: "saved" }),
        });
        pushToast("Job saved!", "success");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item: JobItem) =>
                item.id === jobId ? { ...item, is_saved: !currentlySaved } : item,
              ),
            }
          : null,
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Save action failed", "error");
    }
  };

  return (
    <section
      aria-labelledby="jobs-heading"
      className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-[290px_1fr]"
    >
      <FilterPanel
        filters={filters}
        availableSources={data?.available_sources ?? []}
        availableCountries={data?.available_countries ?? []}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onReset={handleResetFilters}
      />

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1
              id="jobs-heading"
              className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
            >
              Role Explorer
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              {loading ? (
                "Searching indexed roles..."
              ) : error ? (
                "Unable to reach the role index right now."
              ) : data ? (
                <>
                  <span className="font-mono font-semibold tabular-nums text-ink">
                    {data.total}
                  </span>{" "}
                  matching jobs found
                </>
              ) : (
                "Browse indexed roles"
              )}
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            loading={ingesting}
            onClick={handleLiveIngest}
            className="min-h-[44px] sm:min-h-[40px]"
          >
            {ingesting ? "Searching Live Boards..." : "Fetch Fresh Live Jobs"}
          </Button>
        </div>

        {loading ? (
          <SectionState
            status="loading"
            title="Searching indexed roles"
            description="Evaluating filters and computing ATS fit where a CV is active."
            skeletonLines={5}
          />
        ) : error ? (
          <SectionState
            status="error"
            title="Could not load roles"
            description={error}
            onRetry={() => {
              void loadJobs();
            }}
          />
        ) : !data || data.items.length === 0 ? (
          <SectionState
            status="empty"
            title="No jobs match your current filters"
            description="Try widening location, technology, or minimum ATS score filters, or fetch fresh live jobs."
            action={
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResetFilters}
                  className="min-h-[44px] sm:min-h-[36px]"
                >
                  Clear All Filters
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={ingesting}
                  onClick={handleLiveIngest}
                  className="min-h-[44px] sm:min-h-[36px]"
                >
                  Fetch Live Jobs
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="space-y-3.5">
              {data.items.map((job) => (
                <JobCard
                  key={job.id}
                  id={job.id}
                  title={job.title}
                  company={job.company}
                  location={job.location}
                  score={job.score}
                  remote={job.remote_mode}
                  source={job.source}
                  salaryText={job.salary_text}
                  postedAt={job.posted_at}
                  applyUrl={job.apply_url}
                  skills={job.skills}
                  isSaved={job.is_saved}
                  onToggleSave={handleToggleSave}
                />
              ))}
            </div>

            {data.total_pages > 1 && (
              <nav
                aria-label="Role results pagination"
                className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4"
              >
                <span className="font-mono text-xs font-medium tabular-nums text-muted">
                  Page {data.page} of {data.total_pages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={data.page >= data.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Next
                  </Button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function JobExplorerPage() {
  return (
    <Suspense
      fallback={
        <SectionState
          status="loading"
          title="Loading Role Explorer"
          description="Preparing filters and indexed opportunities."
          skeletonLines={5}
        />
      }
    >
      <JobExplorerContent />
    </Suspense>
  );
}
