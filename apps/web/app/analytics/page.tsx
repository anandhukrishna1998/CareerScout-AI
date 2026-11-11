"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { AnalyticsOverview } from "@/lib/types";

function AnalyticsContent() {
  const { pushToast } = useToast();
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const loadAnalytics = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<AnalyticsOverview>("/analytics/overview", {
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setData(res);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load analytics";
      setData(null);
      setError(message);
      pushToast(message, "error");
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [pushToast]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const scoreDistribution = data?.score_distribution ?? [];
  const jobsBySource = data?.jobs_by_source ?? [];
  const jobsByRemoteMode = data?.jobs_by_remote_mode ?? [];
  const applicationFunnel = data?.application_funnel ?? [];
  const topMarketSkills = data?.top_market_skills ?? [];

  const maxBucket = Math.max(1, ...scoreDistribution.map((b) => b.count));
  const maxSource = Math.max(1, ...jobsBySource.map((s) => s.count));

  return (
    <section aria-labelledby="analytics-heading" className="w-full min-w-0 space-y-6 md:space-y-8">
      <div className="min-w-0">
        <h1
          id="analytics-heading"
          className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Analytics Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Match quality distribution, source breakdown, skill demand, and application funnel.
        </p>
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Computing live analytics"
          description="Aggregating match distributions, source breakdown, and application funnel telemetry."
          skeletonLines={6}
        />
      ) : error ? (
        <SectionState
          status="error"
          title="Could not load analytics"
          description={error}
          onRetry={loadAnalytics}
        />
      ) : !data ? (
        <SectionState
          status="empty"
          title="No analytics data yet"
          description="Sync live openings and upload a primary CV to track match distributions and application metrics."
          action={
            <Link href="/jobs" className="btn-primary min-h-[44px] sm:min-h-[36px]">
              Browse Role Explorer
            </Link>
          }
        />
      ) : (
        <>
          <div
            role="region"
            aria-label="Analytics overview telemetry"
            className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-y border-hairline py-3.5 text-sm"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Total Jobs Indexed</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {data.kpis.total_jobs}
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Avg ATS Fit</span>
              <span className="font-mono text-base font-semibold tabular-nums text-accent-text">
                {data.kpis.average_match_score}/100
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">High Fit (&gt;=75)</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {data.kpis.high_match_jobs}
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Digests Dispatched</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {data.kpis.digests_sent}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Match Score Distribution
              </h2>
              {scoreDistribution.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No match scores computed yet.</p>
              ) : (
                <div className="mt-4 space-y-3.5">
                  {scoreDistribution.map((b) => (
                    <div key={b.bucket} className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-medium tabular-nums text-ink">
                          {b.bucket}%
                        </span>
                        <span className="font-mono tabular-nums text-muted">{b.count} jobs</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${b.count > 0 ? Math.max(4, Math.round((b.count / maxBucket) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Jobs by Source
              </h2>
              {jobsBySource.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No source breakdown available yet.</p>
              ) : (
                <div className="mt-4 space-y-3.5">
                  {jobsBySource.map((s) => (
                    <div key={s.source} className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium capitalize text-ink">
                          {s.source}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-muted">
                          {s.count}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-accent/80"
                          style={{
                            width: `${s.count > 0 ? Math.max(4, Math.round((s.count / maxSource) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Application Funnel
              </h2>
              {applicationFunnel.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  No application pipeline stages recorded yet.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-5">
                  {applicationFunnel.map((st) => (
                    <div
                      key={st.stage}
                      className="min-w-0 rounded-xl border border-hairline bg-subtle p-3"
                    >
                      <p className="font-mono text-xl font-semibold tabular-nums text-ink">
                        {st.count}
                      </p>
                      <p className="mt-1 truncate text-xs capitalize text-muted">{st.stage}</p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Work Mode Split
              </h2>
              {jobsByRemoteMode.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No work mode breakdown available yet.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-2.5 text-center sm:grid-cols-3">
                  {jobsByRemoteMode.map((rm) => (
                    <div
                      key={rm.mode}
                      className="min-w-0 rounded-xl border border-hairline bg-subtle p-3"
                    >
                      <p className="font-mono text-xl font-semibold tabular-nums text-ink">
                        {rm.count}
                      </p>
                      <p className="mt-1 truncate text-xs capitalize text-muted">{rm.mode}</p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          {topMarketSkills.length > 0 && (
            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Top Market Skills
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {topMarketSkills.map((sk, idx) => (
                  <Badge key={`${sk.skill}-${idx}`} tone={sk.matched ? "accent" : "neutral"}>
                    <span>{sk.skill}</span>
                    <span className="font-mono tabular-nums opacity-80">({sk.count})</span>
                  </Badge>
                ))}
              </div>
            </Surface>
          )}
        </>
      )}
    </section>
  );
}

export default function AnalyticsDashboardPage() {
  return (
    <AuthGate>
      <AnalyticsContent />
    </AuthGate>
  );
}
