"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { JobCard } from "@/components/job-card";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScoreRing } from "@/components/ui/score-ring";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import { clampScore, scoreBand } from "@/lib/theme-tokens";
import type { AnalyticsOverview, CVItem, JobMatchItem } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

function getSafeExternalUrl(url?: string | null): string | null {
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
      className="h-4 w-4 shrink-0"
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

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function DashboardContent() {
  const { pushToast } = useToast();
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [matches, setMatches] = useState<JobMatchItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mRes, aRes, cvRes] = await Promise.all([
        apiFetch<JobMatchItem[]>("/matches/daily?limit=8"),
        apiFetch<AnalyticsOverview>("/analytics/overview"),
        apiFetch<{ items: CVItem[] }>("/cvs"),
      ]);
      setMatches(Array.isArray(mRes) ? mRes : []);
      setAnalytics(aRes);
      setCvs(Array.isArray(cvRes?.items) ? cvRes.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load dashboard";
      setError(message);
      pushToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFetchLiveJobs = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch<{ total_ingested: number }>("/jobs/ingest", {
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
          hours_old: 720,
        }),
      });
      pushToast(`Synced ${res.total_ingested} live jobs & updated ATS matches!`, "success");
      await loadData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Live fetch failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleSave = async (jobId: number, currentlySaved: boolean) => {
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
      setMatches((prev) =>
        prev.map((m) => (m.job_id === jobId ? { ...m, is_saved: !currentlySaved } : m)),
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not update saved state", "error");
    }
  };

  const displayName = mounted ? user?.full_name?.trim() || "" : "";
  const topMatch = matches[0] ?? null;
  const remainingMatches = matches.slice(1);
  const kpis = analytics?.kpis;
  const primaryCv = cvs.find((cv) => cv.is_primary) ?? cvs[0] ?? null;

  const topScoreRounded = topMatch ? Math.round(clampScore(topMatch.score)) : 0;
  const topBand = scoreBand(topScoreRounded);
  const topBandLabel =
    topBand === "strong" ? "Strong Fit" : topBand === "moderate" ? "Good Fit" : "Developing Fit";
  const topBandTone =
    topBand === "strong" ? "success" : topBand === "moderate" ? "neutral" : "warning";
  const safeTopApplyUrl = topMatch ? getSafeExternalUrl(topMatch.apply_url) : null;

  return (
    <section aria-labelledby="dashboard-heading" className="w-full space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="dashboard-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Your daily ATS-ranked job intelligence and active resume alignment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="primary"
            size="md"
            loading={syncing}
            onClick={handleFetchLiveJobs}
            className="min-h-[44px] sm:min-h-[40px]"
          >
            {syncing ? "Fetching Live Jobs..." : "Fetch Live Jobs"}
          </Button>
          <Link href="/cvs" className="btn-secondary min-h-[44px] sm:min-h-[40px]">
            Manage CVs
          </Link>
        </div>
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Computing personalized ATS matches"
          description="Ranking indexed openings against your active resume and preferences."
          skeletonLines={6}
        />
      ) : error ? (
        <SectionState
          status="error"
          title="Could not load daily matches"
          description={error}
          onRetry={loadData}
        />
      ) : (
        <>
          <div
            aria-label="Daily workspace telemetry"
            className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-y border-hairline py-3.5 text-sm"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Indexed Jobs</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {kpis ? kpis.total_jobs : "—"}
              </span>
              {kpis && kpis.jobs_last_24h > 0 && (
                <span className="font-mono text-xs tabular-nums text-accent-text">
                  +{kpis.jobs_last_24h} 24h
                </span>
              )}
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Top Fit</span>
              <span className="font-mono text-base font-semibold tabular-nums text-accent-text">
                {topMatch ? `${topScoreRounded}/100` : "—"}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                Avg {kpis?.average_match_score ?? 0}/100
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Strong Matches (&gt;=75)</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {kpis?.high_match_jobs ?? 0}
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Saved / Applied</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {kpis?.saved_count ?? 0} / {kpis?.applied_count ?? 0}
              </span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Surface
              variant="hero"
              radius="3xl"
              className="flex flex-col justify-between gap-6 p-6 sm:p-7 lg:col-span-2"
            >
              {topMatch ? (
                <>
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-accent-text">
                            Today&apos;s Strongest Match
                          </span>
                          <Badge tone={topBandTone}>{topBandLabel}</Badge>
                          {topMatch.remote_mode && (
                            <Badge tone="neutral" className="capitalize">
                              {topMatch.remote_mode}
                            </Badge>
                          )}
                        </div>
                        <h2 className="mt-2.5 font-display text-2xl font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
                          {topMatch.title}
                        </h2>
                        <p className="mt-1.5 text-sm text-ink-secondary">
                          {topMatch.company}
                          {topMatch.location ? ` · ${topMatch.location}` : ""}
                          {topMatch.salary_text ? (
                            <>
                              {" · "}
                              <span className="font-mono tabular-nums">{topMatch.salary_text}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <ScoreRing score={topScoreRounded} size="lg" className="shrink-0" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y border-hairline py-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted">Skills</span>
                        <span className="font-mono font-semibold tabular-nums text-ink">
                          {Math.round(topMatch.skill_score)}/60
                        </span>
                      </div>
                      <span aria-hidden="true" className="text-muted">
                        ·
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted">Semantic</span>
                        <span className="font-mono font-semibold tabular-nums text-ink">
                          {Math.round(topMatch.semantic_score)}/25
                        </span>
                      </div>
                      <span aria-hidden="true" className="text-muted">
                        ·
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted">Exp</span>
                        <span className="font-mono font-semibold tabular-nums text-ink">
                          {Math.round(topMatch.experience_score)}/15
                        </span>
                      </div>
                    </div>

                    {topMatch.recommendation && (
                      <p className="max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
                        {topMatch.recommendation}
                      </p>
                    )}

                    {(topMatch.matched_skills.length > 0 || topMatch.missing_skills.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {topMatch.matched_skills.slice(0, 6).map((skill, idx) => (
                          <Badge key={`${skill}-${idx}`} tone="accent">
                            <CheckIcon />
                            <span>{skill}</span>
                          </Badge>
                        ))}
                        {topMatch.missing_skills.slice(0, 3).map((skill, idx) => (
                          <Badge key={`missing-${skill}-${idx}`} tone="warning">
                            Missing: {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
                    <Link
                      href={`/jobs/${topMatch.job_id}`}
                      className="btn-primary min-h-[44px] sm:min-h-[40px]"
                    >
                      <span>Explore Role</span>
                      <ArrowRightIcon />
                    </Link>

                    <button
                      type="button"
                      aria-pressed={topMatch.is_saved}
                      onClick={() => handleToggleSave(topMatch.job_id, topMatch.is_saved)}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[40px] ${
                        topMatch.is_saved
                          ? "border-[rgb(var(--accent)/0.3)] bg-accent-soft text-accent-soft-ink hover:bg-hover"
                          : "border-hairline bg-subtle text-ink hover:bg-hover"
                      }`}
                    >
                      {topMatch.is_saved && <CheckIcon />}
                      <span>{topMatch.is_saved ? "Saved" : "Save Role"}</span>
                    </button>

                    {safeTopApplyUrl && (
                      <a
                        href={safeTopApplyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-quiet min-h-[44px] sm:min-h-[40px]"
                      >
                        <span>Apply Externally</span>
                        <ExternalArrowIcon />
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <Badge tone="warning">Setup required</Badge>
                    <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
                      Ready to rank your daily job feed
                    </h2>
                    <p className="mt-2 max-w-[58ch] text-sm leading-[1.6] text-ink-secondary">
                      Complete your onboarding preferences or upload your primary CV so CareerScout
                      can compute explainable ATS scores for every indexed opening.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href="/onboarding" className="btn-primary min-h-[44px] sm:min-h-[40px]">
                      Complete Onboarding
                    </Link>
                    <Link href="/jobs" className="btn-secondary min-h-[44px] sm:min-h-[40px]">
                      Explore All Jobs
                    </Link>
                  </div>
                </div>
              )}
            </Surface>

            <Surface
              variant="elevated"
              radius="3xl"
              className="flex flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-1"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                    Active Resume
                  </h2>
                  {primaryCv ? (
                    <Badge tone="success">Primary</Badge>
                  ) : (
                    <Badge tone="warning">Missing</Badge>
                  )}
                </div>

                {primaryCv ? (
                  <>
                    <div className="mt-4 flex items-center gap-4">
                      <div
                        aria-label="Active resume status: Ready"
                        className="relative flex h-16 w-16 shrink-0 items-center justify-center"
                      >
                        <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full">
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="rgb(var(--bg-subtle))"
                            strokeWidth="5"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="rgb(var(--accent))"
                            strokeWidth="5"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-accent-text">
                          Ready
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="min-w-0 break-all font-mono text-sm font-medium text-ink">
                          {primaryCv.filename}
                        </p>
                        <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                          {(primaryCv.file_size / 1024).toFixed(1)} KB ·{" "}
                          {primaryCv.parsed.years_experience} yrs ·{" "}
                          <span className="font-sans capitalize">
                            {primaryCv.parsed.experience_level}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-hairline pt-4">
                      <p className="mb-2.5 text-xs font-medium text-muted">Top strengths</p>
                      {primaryCv.parsed.skills.length > 0 ? (
                        <ul className="space-y-2 text-sm text-ink-secondary">
                          {primaryCv.parsed.skills.slice(0, 5).map((skill, idx) => (
                            <li key={`${skill}-${idx}`} className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink"
                              >
                                <CheckIcon />
                              </span>
                              <span className="min-w-0 truncate text-ink">{skill}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs leading-[1.55] text-muted">
                          No parsed skills yet. Edit skills in CV Manager to sharpen scoring.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center gap-3.5">
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-input bg-subtle text-muted"
                      >
                        <UploadIcon />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">No active CV uploaded</p>
                        <p className="mt-1 text-xs leading-[1.55] text-ink-secondary">
                          Upload PDF, DOCX, TXT, or MD to extract skills and compute daily ATS
                          scores.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-hairline pt-4">
                <Link
                  href="/cvs"
                  className={
                    primaryCv
                      ? "btn-secondary w-full min-h-[44px] sm:min-h-[40px]"
                      : "btn-primary w-full min-h-[44px] sm:min-h-[40px]"
                  }
                >
                  {primaryCv ? "Replace CV" : "Upload Primary CV"}
                </Link>
              </div>
            </Surface>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-ink">
                  Curated Match Stream
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Daily recommendations ordered after today&apos;s strongest match.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/ai-insights"
                  className="inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-[36px]"
                >
                  Skill Gap Insights
                </Link>
                <Link
                  href="/jobs?sort=score"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium text-accent-text transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-[36px]"
                >
                  <span>View all in Role Explorer</span>
                  <ArrowRightIcon />
                </Link>
              </div>
            </div>

            {matches.length === 0 ? (
              <SectionState
                status="empty"
                title="No daily matches ranked yet"
                description="Upload your primary CV or update your technologies in Profile Settings to generate tailored matches."
                action={
                  <Link href="/cvs" className="btn-primary min-h-[44px] sm:min-h-[40px]">
                    Upload CV
                  </Link>
                }
              />
            ) : remainingMatches.length === 0 ? (
              <Surface
                variant="subtle"
                radius="2xl"
                className="flex flex-wrap items-center justify-between gap-3 p-5"
              >
                <p className="text-sm text-ink-secondary">
                  Your highest-scoring match is featured above. Explore the full index for more open
                  roles.
                </p>
                <Link href="/jobs" className="btn-secondary min-h-[44px] sm:min-h-[38px]">
                  Browse Role Explorer
                </Link>
              </Surface>
            ) : (
              <MotionReveal delay={0.04}>
                <div className="grid gap-4 md:grid-cols-2">
                  {remainingMatches.map((m) => (
                    <JobCard
                      key={m.job_id}
                      id={m.job_id}
                      title={m.title}
                      company={m.company}
                      location={m.location}
                      score={m.score}
                      remote={m.remote_mode}
                      source={m.source}
                      salaryText={m.salary_text}
                      postedAt={m.posted_at}
                      applyUrl={m.apply_url}
                      skills={m.matched_skills}
                      isSaved={m.is_saved}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>
              </MotionReveal>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}
