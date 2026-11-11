"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MatchScoreCard } from "@/components/match-score-card";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { JobDetail, SavedStatus } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

function getSafeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function ArrowLeftIcon() {
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
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
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

export default function JobDetailsPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  const { accessToken } = useAuthStore();
  const { pushToast } = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusVal, setStatusVal] = useState<SavedStatus>("saved");
  const [notes, setNotes] = useState("");
  const [savingTracker, setSavingTracker] = useState(false);

  const [coverLetter, setCoverLetter] = useState("");
  const [tone, setTone] = useState<"concise" | "enthusiastic" | "executive">("concise");
  const [generatingCL, setGeneratingCL] = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<JobDetail>(`/jobs/${jobId}`);
      setJob(res);
      if (res.saved) {
        setStatusVal(res.saved.status);
        setNotes(res.saved.notes || "");
      } else {
        setStatusVal("saved");
        setNotes("");
      }
    } catch (err) {
      setJob(null);
      setError(err instanceof Error ? err.message : "Could not load job details");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadJob();
  }, [loadJob, accessToken]);

  const handleSaveTracker = async () => {
    if (!job) return;
    if (!accessToken) {
      pushToast("Sign in to track applications", "info");
      return;
    }
    setSavingTracker(true);
    try {
      await apiFetch("/saved-jobs", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, status: statusVal, notes }),
      });
      setJob((prev) =>
        prev
          ? { ...prev, is_saved: true, saved: { status: statusVal, notes, applied_at: null } }
          : null,
      );
      pushToast("Application tracker updated", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSavingTracker(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!job) return;
    if (!accessToken) {
      pushToast("Sign in to generate tailored cover letters", "info");
      return;
    }
    setGeneratingCL(true);
    try {
      const res = await apiFetch<{ cover_letter: string }>("/ai/cover-letter", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, tone }),
      });
      setCoverLetter(res.cover_letter);
      pushToast("Tailored cover letter ready!", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to generate cover letter", "error");
    } finally {
      setGeneratingCL(false);
    }
  };

  const safeApplyUrl = job ? getSafeExternalUrl(job.apply_url) : null;
  const formattedLocation = job
    ? job.city && job.country && job.city.toLowerCase() !== job.country.toLowerCase()
      ? `${job.city}, ${job.country}`
      : job.country || job.city || job.location
    : "";
  const postedDate = job?.posted_at ? job.posted_at.slice(0, 10) : "";

  return (
    <section aria-label="Role dossier" className="w-full min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/jobs"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-accent-text transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-0"
        >
          <ArrowLeftIcon />
          <span>Back to Role Explorer</span>
        </Link>
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Loading role dossier"
          description="Fetching role requirements, ATS match score, and application tracker state."
          skeletonLines={6}
        />
      ) : error || !job ? (
        <SectionState
          status="error"
          title="Could not load role details"
          description={error || "Job not found"}
          onRetry={loadJob}
          action={
            <Link href="/jobs" className="btn-primary min-h-[44px] sm:min-h-[36px]">
              Browse Role Explorer
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Surface variant="elevated" radius="3xl" className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
                    {job.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">
                    <span>{job.company}</span>
                    {formattedLocation && (
                      <>
                        <span aria-hidden="true" className="text-muted">
                          ·
                        </span>
                        <span>{formattedLocation}</span>
                      </>
                    )}
                    {postedDate && (
                      <>
                        <span aria-hidden="true" className="text-muted">
                          ·
                        </span>
                        <time
                          dateTime={job.posted_at}
                          className="font-mono text-xs tabular-nums text-muted"
                        >
                          Posted {postedDate}
                        </time>
                      </>
                    )}
                  </div>
                </div>

                {safeApplyUrl && (
                  <a
                    href={safeApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary min-h-[44px] shrink-0 sm:min-h-[40px]"
                  >
                    <span>Apply on {job.source}</span>
                    <ExternalArrowIcon />
                  </a>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {job.remote_mode && (
                  <Badge tone="neutral" className="capitalize">
                    {job.remote_mode}
                  </Badge>
                )}
                {job.contract_type && <Badge tone="neutral">{job.contract_type}</Badge>}
                {job.experience_level && (
                  <Badge tone="neutral" className="capitalize">
                    {job.experience_level}
                  </Badge>
                )}
                {job.source && <Badge tone="neutral">{job.source}</Badge>}
                {job.salary_text && (
                  <Badge tone="success" className="font-mono tabular-nums">
                    {job.salary_text}
                  </Badge>
                )}
              </div>

              {job.skills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {job.skills.map((skill, idx) => (
                    <Badge key={`${skill}-${idx}`} tone="neutral">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-6 border-t border-hairline pt-6">
                <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Role Description
                </h2>
                <div className="mt-3 max-w-[68ch] break-words whitespace-pre-wrap text-sm leading-[1.65] text-ink-secondary">
                  {job.description}
                </div>
              </div>
            </Surface>

            <Surface variant="elevated" radius="2xl" className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                    AI Cover Letter &amp; Outreach Pitch
                  </h2>
                  <p className="mt-1 text-xs leading-[1.55] text-muted">
                    Tailored to your active CV and this role&apos;s technical requirements.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor="pitch-tone" className="sr-only">
                    Pitch tone
                  </label>
                  <select
                    id="pitch-tone"
                    value={tone}
                    onChange={(e) =>
                      setTone(e.target.value as "concise" | "enthusiastic" | "executive")
                    }
                    className="input-field min-h-[44px] w-auto text-xs sm:min-h-[40px]"
                  >
                    <option value="concise">Concise</option>
                    <option value="enthusiastic">Enthusiastic</option>
                    <option value="executive">Executive</option>
                  </select>
                  <Button
                    variant="primary"
                    size="md"
                    loading={generatingCL}
                    onClick={handleGenerateCoverLetter}
                    className="min-h-[44px] shrink-0 sm:min-h-[40px]"
                  >
                    {generatingCL ? "Drafting..." : "Generate Pitch"}
                  </Button>
                </div>
              </div>

              {coverLetter && (
                <div className="mt-5 space-y-3 border-t border-hairline pt-4">
                  <div>
                    <label
                      htmlFor="pitch-draft"
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Generated pitch draft
                    </label>
                    <textarea
                      id="pitch-draft"
                      rows={8}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      className="input-field max-w-[68ch] leading-[1.6]"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!navigator.clipboard?.writeText) {
                        pushToast("Clipboard unavailable — copy text from the draft box.", "info");
                        return;
                      }
                      navigator.clipboard
                        .writeText(coverLetter)
                        .then(() => pushToast("Copied pitch to clipboard!", "success"))
                        .catch(() => pushToast("Could not copy automatically.", "error"));
                    }}
                    className="min-h-[44px] sm:min-h-[36px]"
                  >
                    Copy to Clipboard
                  </Button>
                </div>
              )}
            </Surface>
          </div>

          <aside
            aria-label="Match analysis and tracker"
            className="min-w-0 space-y-5 lg:sticky lg:top-24"
          >
            {job.match ? (
              <MatchScoreCard
                score={job.match.score}
                skillScore={job.match.skill_score}
                semanticScore={job.match.semantic_score}
                experienceScore={job.match.experience_score}
                strengths={job.match.strengths}
                missing={job.match.missing_skills}
                actionItems={job.match.action_items}
                recommendation={job.match.recommendation}
              />
            ) : (
              <Surface variant="elevated" radius="2xl" className="p-6">
                <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Personalized ATS Score
                </h2>
                <p className="mt-2 text-sm leading-[1.55] text-ink-secondary">
                  {accessToken
                    ? "Upload a primary CV to compute detailed skill overlap and ATS score for this role."
                    : "Sign in and upload your CV to view detailed skill overlap and ATS score for this role."}
                </p>
                <Link
                  href={accessToken ? "/cvs" : "/auth/login"}
                  className="btn-primary mt-4 min-h-[44px] sm:min-h-[40px]"
                >
                  {accessToken ? "Upload Primary CV" : "Sign in"}
                </Link>
              </Surface>
            )}

            <Surface variant="elevated" radius="2xl" className="p-6">
              <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                Application Tracker
              </h2>
              <p className="mt-1 text-xs text-muted">
                Save pipeline status and interview notes for this role.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="tracker-status"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Pipeline Stage
                  </label>
                  <select
                    id="tracker-status"
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value as SavedStatus)}
                    className="input-field min-h-[44px] sm:min-h-[42px]"
                  >
                    <option value="saved">Saved</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tracker-notes"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Notes
                  </label>
                  <textarea
                    id="tracker-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input-field"
                    placeholder="Recruiter contact, interview date, salary notes..."
                  />
                </div>

                <Button
                  variant="primary"
                  size="md"
                  loading={savingTracker}
                  onClick={handleSaveTracker}
                  className="w-full min-h-[44px] sm:min-h-[40px]"
                >
                  {savingTracker ? "Saving..." : job.is_saved ? "Update Tracker" : "Save Job"}
                </Button>
              </div>
            </Surface>
          </aside>
        </div>
      )}
    </section>
  );
}
