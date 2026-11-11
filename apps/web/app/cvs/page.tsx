"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch, downloadWithAuth } from "@/lib/api";
import type { CVItem } from "@/lib/types";

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

function AlertCircleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0"
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
  );
}

function CVManagerContent() {
  const uid = useId();
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const busyCvIdsRef = useRef<Set<number>>(new Set());
  const uploadingRef = useRef(false);

  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [busyCvIds, setBusyCvIds] = useState<Set<number>>(() => new Set());

  const [pasteMode, setPasteMode] = useState(false);
  const [pasteFilename, setPasteFilename] = useState("my-cv.txt");
  const [pasteText, setPasteText] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSkills, setEditSkills] = useState("");
  const [editYears, setEditYears] = useState(0);
  const [editSummary, setEditSummary] = useState("");

  const setCvBusy = (id: number, busy: boolean) => {
    if (busy) {
      busyCvIdsRef.current.add(id);
    } else {
      busyCvIdsRef.current.delete(id);
    }
    setBusyCvIds((prev) => {
      const next = new Set(prev);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      loadAbortRef.current?.abort();
    };
  }, []);

  const loadCVs = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch<{ items: CVItem[] }>("/cvs", {
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setCvs(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Could not load CVs";
      setLoadError(message);
      pushToast(message, "error");
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [pushToast]);

  useEffect(() => {
    void loadCVs();
  }, [loadCVs]);

  const handleFileUpload = async (file: File) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setActionError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("set_primary", "true");
      await apiFetch("/cvs/upload", { method: "POST", body: form });
      if (!mountedRef.current) return;
      pushToast(`Uploaded & parsed ${file.name}`, "success");
      await loadCVs();
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Upload failed";
      setActionError(message);
      pushToast(message, "error");
    } finally {
      uploadingRef.current = false;
      if (mountedRef.current) {
        setUploading(false);
      }
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingRef.current) return;
    const trimmed = pasteText.trim();
    if (!trimmed) {
      const message = "Paste resume text first (at least 15 characters).";
      setActionError(message);
      pushToast(message, "error");
      return;
    }
    if (trimmed.length < 15) {
      const message = "Please paste at least 15 characters of CV text before parsing.";
      setActionError(message);
      pushToast(message, "error");
      return;
    }
    uploadingRef.current = true;
    setActionError("");
    setUploading(true);
    try {
      await apiFetch("/cvs/from-text", {
        method: "POST",
        body: JSON.stringify({
          filename: pasteFilename.trim() || "pasted-cv.txt",
          text: trimmed,
          set_primary: true,
        }),
      });
      if (!mountedRef.current) return;
      pushToast("CV saved, parsed & set as primary!", "success");
      setPasteText("");
      setPasteMode(false);
      await loadCVs();
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Could not save CV";
      setActionError(message);
      pushToast(message, "error");
    } finally {
      uploadingRef.current = false;
      if (mountedRef.current) {
        setUploading(false);
      }
    }
  };

  const handleSetPrimary = async (id: number) => {
    if (busyCvIdsRef.current.has(id) || uploadingRef.current) return;
    setCvBusy(id, true);
    try {
      await apiFetch(`/cvs/${id}/primary`, { method: "POST" });
      if (!mountedRef.current) return;
      pushToast("Primary CV updated & matches recomputed!", "success");
      await loadCVs();
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Could not set primary CV", "error");
    } finally {
      if (mountedRef.current) {
        setCvBusy(id, false);
      }
    }
  };

  const handleDownload = async (cv: CVItem) => {
    if (busyCvIdsRef.current.has(cv.id)) return;
    setCvBusy(cv.id, true);
    try {
      await downloadWithAuth(`/cvs/${cv.id}/download`, cv.filename);
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      if (mountedRef.current) {
        setCvBusy(cv.id, false);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (busyCvIdsRef.current.has(id) || uploadingRef.current) return;
    setCvBusy(id, true);
    try {
      await apiFetch(`/cvs/${id}`, { method: "DELETE" });
      if (!mountedRef.current) return;
      setEditingId((prev) => (prev === id ? null : prev));
      pushToast("CV deleted", "info");
      await loadCVs();
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      if (mountedRef.current) {
        setCvBusy(id, false);
      }
    }
  };

  const handleSaveParsedEdits = async (id: number) => {
    if (busyCvIdsRef.current.has(id) || uploadingRef.current) return;
    setCvBusy(id, true);
    try {
      const skills = editSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/cvs/${id}/parsed`, {
        method: "PATCH",
        body: JSON.stringify({
          summary: editSummary,
          skills,
          years_experience: Number(editYears),
        }),
      });
      if (!mountedRef.current) return;
      setEditingId((prev) => (prev === id ? null : prev));
      pushToast("Parsed CV skills updated & matches refreshed!", "success");
      await loadCVs();
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      if (mountedRef.current) {
        setCvBusy(id, false);
      }
    }
  };

  const pasteFilenameId = `${uid}-paste-filename`;
  const pasteTextId = `${uid}-paste-text`;
  const fileInputId = `${uid}-cv-file-input`;

  return (
    <section aria-labelledby="cvs-heading" className="w-full min-w-0 space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="cvs-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            CV Manager
          </h1>
          <p className="mt-1 max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
            Upload PDF, DOCX, TXT, or MD resumes — encrypted at rest and parsed for ATS scoring.
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          aria-expanded={pasteMode}
          disabled={uploading}
          onClick={() => {
            setActionError("");
            setPasteMode((v) => !v);
          }}
          className="min-h-[44px]"
        >
          {pasteMode ? "Hide Paste Form" : "Paste CV Text Instead"}
        </Button>
      </div>

      <Surface variant="hero" radius="3xl" className="min-w-0 p-6 sm:p-7">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsDragging(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (uploadingRef.current) return;
            const dropped = e.dataTransfer?.files?.[0] || null;
            if (dropped) {
              void handleFileUpload(dropped);
            }
          }}
          className={`rounded-2xl border border-dashed p-5 transition sm:p-6 ${
            isDragging ? "border-accent bg-accent-soft/40" : "border-input bg-subtle/60"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--accent)/0.25)] bg-accent-soft text-accent"
              >
                <UploadIcon />
              </span>
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-ink">Upload new CV</p>
                <p className="mt-0.5 text-xs text-muted">Max 10 MB · PDF, DOCX, TXT, Markdown</p>
              </div>
            </div>

            <div className="shrink-0">
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                tabIndex={-1}
                aria-label="Choose CV file (PDF, DOCX, TXT, or MD)"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) {
                    void handleFileUpload(file);
                  }
                }}
              />
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={uploading}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px]"
              >
                {uploading ? "Uploading & Parsing..." : "Choose File"}
              </Button>
            </div>
          </div>
        </div>

        {actionError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-3 text-xs leading-5 text-status-danger-fg"
          >
            <AlertCircleIcon />
            <span>{actionError}</span>
          </div>
        )}

        {pasteMode && (
          <form
            onSubmit={handlePasteSubmit}
            className="mt-5 space-y-4 border-t border-hairline pt-5"
          >
            <div>
              <label
                htmlFor={pasteFilenameId}
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Filename
              </label>
              <input
                id={pasteFilenameId}
                value={pasteFilename}
                disabled={uploading}
                onChange={(e) => setPasteFilename(e.target.value)}
                className="input-field disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Filename (e.g. ml-engineer-cv.txt)"
              />
            </div>

            <div>
              <label htmlFor={pasteTextId} className="mb-1.5 block text-xs font-medium text-muted">
                Resume Text
              </label>
              <textarea
                id={pasteTextId}
                rows={5}
                required
                minLength={15}
                disabled={uploading}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  if (actionError) setActionError("");
                }}
                className="input-field disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Paste your CV summary, work experience, and technical skills..."
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={uploading}
              disabled={uploading}
              className="min-h-[44px]"
            >
              {uploading ? "Parsing..." : "Save & Parse CV"}
            </Button>
          </form>
        )}
      </Surface>

      {loading ? (
        <SectionState
          status="loading"
          title="Loading your CVs"
          description="Decrypting stored resumes and parsed ATS skill profiles."
          skeletonLines={4}
        />
      ) : loadError ? (
        <SectionState
          status="error"
          title="Could not load CVs"
          description={loadError}
          onRetry={loadCVs}
        />
      ) : cvs.length === 0 ? (
        <SectionState
          status="empty"
          title="No CVs uploaded yet"
          description="Upload your resume above (PDF, DOCX, TXT, or MD) or paste CV text to generate ATS match scores."
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] sm:min-h-[36px]"
            >
              Choose File
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {cvs.map((cv) => {
            const isBusy = busyCvIds.has(cv.id);
            const summaryInputId = `${uid}-summary-${cv.id}`;
            const skillsInputId = `${uid}-skills-${cv.id}`;
            const yearsInputId = `${uid}-years-${cv.id}`;

            return (
              <article key={cv.id}>
                <Surface
                  variant="elevated"
                  radius="2xl"
                  className={`min-w-0 p-5 sm:p-6 ${
                    cv.is_primary ? "border-[rgb(var(--accent)/0.35)]" : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 sm:flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 break-words font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                          {cv.filename}
                        </h2>
                        {cv.is_primary && <Badge tone="success">Active Primary</Badge>}
                        {cv.encrypted && <Badge tone="neutral">Encrypted</Badge>}
                      </div>
                      <p className="mt-1.5 font-mono text-xs tabular-nums text-muted">
                        {(cv.file_size / 1024).toFixed(1)} KB · {cv.parsed.years_experience} yrs exp
                        ·{" "}
                        <span className="font-sans capitalize text-ink-secondary">
                          Level: {cv.parsed.experience_level}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!cv.is_primary && (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          loading={isBusy}
                          disabled={isBusy || uploading}
                          onClick={() => handleSetPrimary(cv.id)}
                          className="min-h-[44px] sm:min-h-[36px]"
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleDownload(cv)}
                        className="min-h-[44px] sm:min-h-[36px]"
                      >
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingId(cv.id);
                          setEditSkills(cv.parsed.skills.join(", "));
                          setEditYears(cv.parsed.years_experience);
                          setEditSummary(cv.parsed.summary);
                        }}
                        className="min-h-[44px] sm:min-h-[36px]"
                      >
                        Edit Skills
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={isBusy}
                        disabled={isBusy || uploading}
                        onClick={() => handleDelete(cv.id)}
                        className="min-h-[44px] sm:min-h-[36px]"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {editingId === cv.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveParsedEdits(cv.id);
                      }}
                      className="mt-4 space-y-3 border-t border-hairline pt-4"
                    >
                      <div>
                        <label
                          htmlFor={summaryInputId}
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Summary
                        </label>
                        <input
                          id={summaryInputId}
                          disabled={isBusy || uploading}
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                        <div className="min-w-0">
                          <label
                            htmlFor={skillsInputId}
                            className="mb-1.5 block text-xs font-medium text-muted"
                          >
                            Skills (comma-separated)
                          </label>
                          <input
                            id={skillsInputId}
                            disabled={isBusy || uploading}
                            value={editSkills}
                            onChange={(e) => setEditSkills(e.target.value)}
                            className="input-field"
                          />
                        </div>
                        <div className="min-w-0">
                          <label
                            htmlFor={yearsInputId}
                            className="mb-1.5 block text-xs font-medium text-muted"
                          >
                            Years Experience
                          </label>
                          <input
                            id={yearsInputId}
                            type="number"
                            min={0}
                            max={50}
                            step={1}
                            disabled={isBusy || uploading}
                            value={editYears}
                            onChange={(e) => setEditYears(Number(e.target.value))}
                            className="input-field font-mono tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          loading={isBusy}
                          disabled={isBusy || uploading}
                          className="min-h-[44px] sm:min-h-[36px]"
                        >
                          Save &amp; Re-score
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setEditingId(null)}
                          className="min-h-[44px] sm:min-h-[36px]"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {cv.parsed.summary && (
                        <p className="mt-3 max-w-[68ch] break-words text-sm leading-[1.55] text-ink-secondary">
                          {cv.parsed.summary}
                        </p>
                      )}
                      {(cv.parsed.skills.length > 0 || cv.parsed.languages.length > 0) && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          {cv.parsed.skills.map((s, idx) => (
                            <Badge key={`skill-${s}-${idx}`} tone="accent">
                              {s}
                            </Badge>
                          ))}
                          {cv.parsed.languages.map((l, idx) => (
                            <Badge key={`lang-${l}-${idx}`} tone="neutral">
                              {l}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Surface>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function CVManagerPage() {
  return (
    <AuthGate>
      <CVManagerContent />
    </AuthGate>
  );
}
