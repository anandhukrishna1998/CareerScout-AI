"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import { clampScore, scoreBand } from "@/lib/theme-tokens";
import type { InsightsResponse } from "@/lib/types";

function ArrowRightIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
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

function AIInsightsContent() {
  const { pushToast } = useToast();
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [data, setData] = useState<InsightsResponse | null>(null);
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

  const loadInsights = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<InsightsResponse>("/matches/insights", {
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setData(res);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load insights";
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
    void loadInsights();
  }, [loadInsights]);

  const topMissingSkills = data?.top_missing_skills ?? [];
  const topStrengths = data?.top_strengths ?? [];
  const marketDemand = data?.market_skill_demand ?? [];
  const recommendations = data?.recommendations ?? [];

  const maxMissing = Math.max(1, ...topMissingSkills.map((s) => s.demand_count));
  const maxMarket = Math.max(1, ...marketDemand.map((s) => s.demand_count));
  const readinessScore = data ? Math.round(clampScore(data.ats_readiness_score)) : 0;
  const band = scoreBand(readinessScore);
  const bandLabel =
    band === "strong" ? "Strong Readiness" : band === "moderate" ? "Good Readiness" : "Needs Focus";
  const bandTone = band === "strong" ? "success" : band === "moderate" ? "neutral" : "warning";

  return (
    <section
      aria-labelledby="ai-insights-heading"
      className="w-full min-w-0 space-y-6 md:space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="ai-insights-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            AI Insights
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Cross-market ATS gap analysis based on{" "}
            <span className="font-mono font-medium tabular-nums text-ink">
              {data ? data.jobs_analyzed : "—"}
            </span>{" "}
            live openings.
          </p>
        </div>

        <Link href="/ai-chat" className="btn-primary min-h-[44px] sm:min-h-[40px]">
          <span>Discuss With AI Coach</span>
          <ArrowRightIcon />
        </Link>
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Analyzing skill demand across live jobs"
          description="Comparing your primary CV skills against indexed market requirements."
          skeletonLines={6}
        />
      ) : error ? (
        <SectionState
          status="error"
          title="Could not load AI insights"
          description={error}
          onRetry={loadInsights}
        />
      ) : !data ? (
        <SectionState
          status="empty"
          title="No insights available yet"
          description="Upload a primary CV and index live openings to unlock skill gap intelligence."
          action={
            <Link href="/cvs" className="btn-primary min-h-[44px] sm:min-h-[36px]">
              Upload Primary CV
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Surface
              variant="hero"
              radius="3xl"
              className="flex min-w-0 flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-1"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Market ATS Readiness
                </h2>
                <Badge tone={bandTone}>{bandLabel}</Badge>
              </div>

              <div className="flex flex-col items-center py-2">
                <ScoreRing score={readinessScore} label="Average alignment" size="lg" />
                <p className="mt-2 text-center text-xs text-muted">
                  Average alignment across recent indexed roles
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-4">
                <div className="min-w-0 rounded-xl border border-hairline bg-subtle px-3.5 py-2.5">
                  <p className="text-xs text-muted">Active Profile Skills</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">
                    {data.cv_skills_count}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-hairline bg-subtle px-3.5 py-2.5">
                  <p className="text-xs text-muted">High-ROI Gaps</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">
                    {topMissingSkills.length}
                  </p>
                </div>
              </div>
            </Surface>

            <Surface
              variant="elevated"
              radius="3xl"
              className="flex min-w-0 flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-2"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                    Profile Coverage &amp; Strategic Recommendations
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {data.jobs_analyzed} roles analyzed
                  </span>
                </div>

                {topStrengths.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">
                      Verified profile strengths
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {topStrengths.slice(0, 8).map((strength, idx) => (
                        <Badge key={`${strength.skill}-${idx}`} tone="accent">
                          <CheckIcon />
                          <span>{strength.skill}</span>
                          <span className="font-mono tabular-nums opacity-80">
                            ({strength.matched_count})
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2.5 text-xs font-medium text-muted">Recommended next steps</p>
                  {recommendations.length === 0 ? (
                    <p className="text-sm text-ink-secondary">
                      Upload a primary CV or sync more roles to generate tailored recommendations.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {recommendations.map((rec, idx) => (
                        <li
                          key={`${rec}-${idx}`}
                          className="flex items-start gap-2.5 rounded-xl border border-hairline bg-subtle px-4 py-3 text-sm leading-[1.55] text-ink-secondary"
                        >
                          <span className="mt-1 shrink-0 text-accent-text">
                            <ArrowRightIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 max-w-[68ch] break-words">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Surface>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Surface variant="elevated" radius="2xl" className="min-w-0 p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Top Missing Skills by Impact
              </h2>
              {topMissingSkills.length === 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="success">No major missing skills</Badge>
                  <p className="text-sm text-ink-secondary">
                    Your active profile covers core requirements across analyzed jobs.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3.5">
                  {topMissingSkills.map((item, idx) => (
                    <div key={`${item.skill}-${idx}`} className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-ink">{item.skill}</span>
                        <span className="shrink-0 font-mono tabular-nums text-[rgb(var(--status-warning-fg))]">
                          {item.demand_count} jobs · +{item.impact}% potential boost
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-[rgb(var(--status-warning-fg))]"
                          style={{
                            width: `${item.demand_count > 0 ? Math.min(100, Math.max(4, Math.round((item.demand_count / maxMissing) * 100))) : 0}%`,
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
                Top Market Demand vs Your Coverage
              </h2>
              {marketDemand.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No skill demand breakdown available yet.</p>
              ) : (
                <div className="mt-4 space-y-3.5">
                  {marketDemand.map((item, idx) => (
                    <div key={`${item.skill}-${idx}`} className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-ink">{item.skill}</span>
                          <Badge tone={item.in_cv ? "success" : "neutral"} className="shrink-0">
                            {item.in_cv ? "Matched" : "Missing"}
                          </Badge>
                        </div>
                        <span className="shrink-0 font-mono tabular-nums text-muted">
                          {item.demand_count} roles
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-subtle">
                        <div
                          className={`h-full rounded-full ${
                            item.in_cv ? "bg-accent" : "bg-ink-secondary/45"
                          }`}
                          style={{
                            width: `${item.demand_count > 0 ? Math.min(100, Math.max(4, Math.round((item.demand_count / maxMarket) * 100))) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>
        </>
      )}
    </section>
  );
}

export default function AIInsightsPage() {
  return (
    <AuthGate>
      <AIInsightsContent />
    </AuthGate>
  );
}
