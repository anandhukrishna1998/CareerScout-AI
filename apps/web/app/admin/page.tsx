"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminStatus } from "@/lib/types";

function formatRunTimestamp(raw?: string | null): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full ${
        ok ? "bg-[rgb(var(--status-success-fg))]" : "bg-[rgb(var(--status-warning-fg))]"
      }`}
    />
  );
}

function AdminContent() {
  const { pushToast } = useToast();
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const loadStatus = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<AdminStatus>("/admin/status", {
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setStatus(res);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setStatus(null);
      if (err instanceof ApiError && err.status === 403) {
        setError(
          "Admin role is required to view system operations. (Try Demo Account in dev mode for admin telemetry.)",
        );
      } else {
        setError(err instanceof Error ? err.message : "Could not load admin status");
      }
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleRunScrape = async () => {
    if (scraping) return;
    setScraping(true);
    try {
      const res = await apiFetch<{ total_ingested: number }>("/admin/scrape", {
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
      if (!mountedRef.current) return;
      pushToast(`Scrape complete: ${res.total_ingested} jobs ingested`, "success");
      await loadStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Scrape failed", "error");
    } finally {
      if (mountedRef.current) {
        setScraping(false);
      }
    }
  };

  const apiDbOk =
    Boolean(status) &&
    status?.services.api.status === "ok" &&
    status?.services.database.status === "ok";
  const aiOk = status?.services.ai_engine.status === "ok";
  const redisOk = status?.services.redis.status === "ok";

  return (
    <section aria-labelledby="admin-heading" className="w-full min-w-0 space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="admin-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            Admin Operations
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Service health, queue depth, source configuration, and scrape runs.
          </p>
        </div>

        {status && !error && (
          <Button
            variant="primary"
            size="md"
            loading={scraping}
            disabled={loading || scraping}
            onClick={handleRunScrape}
            className="min-h-[44px]"
          >
            {scraping ? "Running Scrape..." : "Trigger Multi-Source Scrape"}
          </Button>
        )}
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Checking services and scraper telemetry"
          description="Querying API, database, AI engine, Redis queue, and source connectors."
          skeletonLines={5}
        />
      ) : error || !status ? (
        <SectionState
          status="error"
          title="Could not load admin telemetry"
          description={error || "Admin data unavailable."}
          onRetry={loadStatus}
        />
      ) : (
        <>
          <div
            role="region"
            aria-label="System health telemetry"
            className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-y border-hairline py-3.5 text-sm"
          >
            <div className="flex items-center gap-2">
              <StatusDot ok={apiDbOk} />
              <span className="text-xs font-medium text-muted">API &amp; DB</span>
              <span className="font-mono text-sm font-semibold text-ink">
                {status.services.api.status} /{" "}
                {status.services.database.dialect || status.services.database.status}
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-center gap-2">
              <StatusDot ok={aiOk} />
              <span className="text-xs font-medium text-muted">AI Engine</span>
              <span
                className={`font-mono text-sm font-semibold ${
                  aiOk
                    ? "text-[rgb(var(--status-success-fg))]"
                    : "text-[rgb(var(--status-warning-fg))]"
                }`}
              >
                {status.services.ai_engine.status}
              </span>
              <span className="text-xs text-muted">
                ({status.services.ai_engine.llm_mode || "fallback ready"})
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-center gap-2">
              <StatusDot ok={redisOk} />
              <span className="text-xs font-medium text-muted">Redis Queue</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                {status.services.redis.status} ({status.services.redis.queue_depth ?? 0})
              </span>
            </div>

            <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:inline-block" />

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted">Jobs / Users</span>
              <span className="font-mono text-base font-semibold tabular-nums text-ink">
                {status.metrics.total_jobs} / {status.metrics.total_users}
              </span>
              {status.metrics.recent_failures > 0 && (
                <Badge tone="danger" className="font-mono tabular-nums">
                  {status.metrics.recent_failures} failures
                </Badge>
              )}
            </div>
          </div>

          <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              Configured Scraping Sources (
              <span className="font-mono tabular-nums">{status.sources.length}</span>)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {status.sources.map((src) => (
                <div
                  key={src.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-hairline bg-subtle px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{src.name}</p>
                    <p className="truncate text-xs text-muted">{src.type}</p>
                  </div>
                  <Badge tone={src.configured ? "success" : "neutral"} className="shrink-0">
                    {src.configured ? "Ready" : "Needs Env"}
                  </Badge>
                </div>
              ))}
            </div>
          </Surface>

          <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              Recent Ingestion Runs
            </h2>
            {status.recent_runs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No scrape runs recorded yet. Trigger a scrape above.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-b border-hairline text-muted">
                    <tr>
                      <th className="py-2.5 pr-4 font-medium">Source</th>
                      <th className="py-2.5 pr-4 font-medium">Backend</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 pr-4 font-medium">Fetched</th>
                      <th className="py-2.5 pr-4 font-medium">Duration</th>
                      <th className="py-2.5 font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-ink-secondary">
                    {status.recent_runs.map((run) => (
                      <tr key={run.id} className="transition-colors hover:bg-subtle/50">
                        <td className="py-2.5 pr-4 font-medium text-ink">{run.source}</td>
                        <td className="py-2.5 pr-4">{run.backend}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              tone={
                                run.status === "success"
                                  ? "success"
                                  : run.status === "failed"
                                    ? "danger"
                                    : "neutral"
                              }
                              className="capitalize"
                            >
                              {run.status}
                            </Badge>
                            {run.status === "failed" && run.error_message && (
                              <p className="max-w-[260px] break-words text-[11px] leading-snug text-status-danger-fg">
                                {run.error_message}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums text-ink">
                          {run.jobs_fetched}
                        </td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">{run.duration_ms} ms</td>
                        <td className="py-2.5 font-mono tabular-nums text-muted">
                          {formatRunTimestamp(run.started_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  return (
    <AuthGate>
      <AdminContent />
    </AuthGate>
  );
}
