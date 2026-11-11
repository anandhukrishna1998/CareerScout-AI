"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { SavedJobItem, SavedStatus } from "@/lib/types";

const STATUS_TABS: Array<{ key: "all" | SavedStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

function getSafeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
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

function SavedJobsContent() {
  const { pushToast } = useToast();
  const [items, setItems] = useState<SavedJobItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | SavedStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [busyJobIds, setBusyJobIds] = useState<Set<number>>(() => new Set());
  const busyJobIdsRef = useRef<Set<number>>(new Set());

  const setJobBusy = (jobId: number, busy: boolean) => {
    if (busy) {
      busyJobIdsRef.current.add(jobId);
    } else {
      busyJobIdsRef.current.delete(jobId);
    }
    setBusyJobIds((prev) => {
      const next = new Set(prev);
      if (busy) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ items: SavedJobItem[] }>("/saved-jobs");
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load saved jobs";
      setError(message);
      pushToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const handleStatusChange = async (jobId: number, status: SavedStatus) => {
    if (busyJobIdsRef.current.has(jobId)) return;
    setJobBusy(jobId, true);
    try {
      await apiFetch(`/saved-jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setItems((prev) => prev.map((it) => (it.job_id === jobId ? { ...it, status } : it)));
      pushToast(`Marked as ${status}`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Status update failed", "error");
    } finally {
      setJobBusy(jobId, false);
    }
  };

  const handleSaveNotes = async (jobId: number) => {
    if (busyJobIdsRef.current.has(jobId)) return;
    setJobBusy(jobId, true);
    try {
      await apiFetch(`/saved-jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft }),
      });
      setItems((prev) =>
        prev.map((it) => (it.job_id === jobId ? { ...it, notes: notesDraft } : it)),
      );
      setEditingNotesId((prev) => (prev === jobId ? null : prev));
      pushToast("Notes saved", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not save notes", "error");
    } finally {
      setJobBusy(jobId, false);
    }
  };

  const handleRemove = async (jobId: number) => {
    if (busyJobIdsRef.current.has(jobId)) return;
    setJobBusy(jobId, true);
    try {
      await apiFetch(`/saved-jobs/${jobId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.job_id !== jobId));
      setEditingNotesId((prev) => (prev === jobId ? null : prev));
      pushToast("Removed from saved jobs", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Remove failed", "error");
    } finally {
      setJobBusy(jobId, false);
    }
  };

  const filtered = filterStatus === "all" ? items : items.filter((i) => i.status === filterStatus);

  return (
    <section aria-labelledby="saved-jobs-heading" className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            id="saved-jobs-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            Saved Jobs &amp; Tracker
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Track applications cleanly from bookmark through offer.
          </p>
        </div>

        <Link href="/jobs" className="btn-secondary min-h-[44px] sm:min-h-[40px]">
          Browse Role Explorer
        </Link>
      </div>

      <div
        role="group"
        aria-label="Filter saved roles by pipeline stage"
        className="flex flex-wrap gap-2"
      >
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === "all" ? items.length : items.filter((i) => i.status === tab.key).length;
          const active = filterStatus === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterStatus(tab.key)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-[38px] ${
                active
                  ? "border-[rgb(var(--accent)/0.3)] bg-accent-soft text-accent-soft-ink"
                  : "border-hairline bg-subtle text-ink-secondary hover:bg-hover hover:text-ink"
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono tabular-nums">({loading || error ? "—" : count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Loading saved tracker"
          description="Fetching your bookmarked roles, stages, and interview notes."
          skeletonLines={4}
        />
      ) : error ? (
        <SectionState
          status="error"
          title="Could not load saved jobs"
          description={error}
          onRetry={loadSaved}
        />
      ) : filtered.length === 0 ? (
        <SectionState
          status="empty"
          title={items.length === 0 ? "No saved jobs yet" : "No jobs in this pipeline stage"}
          description={
            items.length === 0
              ? "Save openings from Daily Matches or Role Explorer to track pipeline stages and notes."
              : "Try switching stage filters above or explore additional roles."
          }
          action={
            <Link href="/jobs" className="btn-primary min-h-[44px] sm:min-h-[36px]">
              Browse Role Explorer
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const safeApplyUrl = getSafeExternalUrl(item.job.apply_url);
            const isBusy = busyJobIds.has(item.job_id);
            const statusSelectId = `saved-status-${item.job_id}`;
            const notesInputId = `saved-notes-${item.job_id}`;

            return (
              <article key={item.id}>
                <Surface variant="elevated" radius="2xl" className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="min-w-0">
                        <Link
                          href={`/jobs/${item.job_id}`}
                          className="inline-flex min-h-[44px] max-w-full items-center rounded-md font-display text-lg font-semibold tracking-[-0.015em] text-ink transition-colors duration-150 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-0"
                        >
                          <span className="min-w-0 break-words">{item.job.title}</span>
                        </Link>
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                        <span>{item.job.company}</span>
                        {item.job.location && (
                          <>
                            <span aria-hidden="true" className="text-muted">
                              ·
                            </span>
                            <span className="text-muted">{item.job.location}</span>
                          </>
                        )}
                        {item.job.remote_mode && (
                          <Badge tone="neutral" className="capitalize">
                            {item.job.remote_mode}
                          </Badge>
                        )}
                        {item.job.salary_text && (
                          <Badge tone="success" className="font-mono tabular-nums">
                            {item.job.salary_text}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {item.job.score !== null && item.job.score !== undefined && (
                        <ScoreRing score={item.job.score} size="sm" />
                      )}
                      <div>
                        <label htmlFor={statusSelectId} className="sr-only">
                          Application status for {item.job.title}
                        </label>
                        <select
                          id={statusSelectId}
                          disabled={isBusy}
                          value={item.status}
                          onChange={(e) =>
                            handleStatusChange(item.job_id, e.target.value as SavedStatus)
                          }
                          className="input-field min-h-[44px] w-auto text-xs sm:min-h-[40px]"
                        >
                          <option value="saved">Saved</option>
                          <option value="applied">Applied</option>
                          <option value="interviewing">Interviewing</option>
                          <option value="offer">Offer</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {editingNotesId === item.job_id ? (
                    <div className="mt-4 space-y-2.5 border-t border-hairline pt-4">
                      <div>
                        <label
                          htmlFor={notesInputId}
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Application Notes
                        </label>
                        <textarea
                          id={notesInputId}
                          rows={2}
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          className="input-field text-sm"
                          placeholder="Add recruiter notes or follow-up dates..."
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          loading={isBusy}
                          onClick={() => handleSaveNotes(item.job_id)}
                          className="min-h-[44px] sm:min-h-[36px]"
                        >
                          Save Notes
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setEditingNotesId(null)}
                          className="min-h-[44px] sm:min-h-[36px]"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 max-w-[68ch] break-words text-sm leading-[1.55] text-ink-secondary">
                      {item.notes ? item.notes : <span className="text-muted">No notes yet.</span>}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-hairline pt-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingNotesId(item.job_id);
                          setNotesDraft(item.notes || "");
                        }}
                        className="min-h-[44px] sm:min-h-[36px]"
                      >
                        Edit Notes
                      </Button>
                      <Link
                        href={`/jobs/${item.job_id}`}
                        className="btn-secondary min-h-[44px] px-4 py-2 text-xs sm:min-h-[36px]"
                      >
                        Details
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {safeApplyUrl && (
                        <a
                          href={safeApplyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Apply to ${item.job.title} at ${item.job.company} (opens in new tab)`}
                          className="btn-primary min-h-[44px] px-4 py-2 text-xs sm:min-h-[36px]"
                        >
                          <span>Apply</span>
                          <ExternalArrowIcon />
                        </a>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleRemove(item.job_id)}
                        className="min-h-[44px] sm:min-h-[36px]"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </Surface>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function SavedJobsPage() {
  return (
    <AuthGate>
      <SavedJobsContent />
    </AuthGate>
  );
}
