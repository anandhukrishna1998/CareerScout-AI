"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ChatMessage, JobItem, JobListResponse } from "@/lib/types";
import { useToast } from "./providers";
import { Button } from "./ui/button";
import { SectionState } from "./ui/section-state";
import { Surface } from "./ui/surface";

export type AIChatPanelProps = {
  initialJobId?: number | null;
};

const SUGGESTED_PROMPTS = [
  "What missing skills should I prioritize learning first?",
  "How can I improve my CV to raise my ATS score?",
  "Give me an interview preparation plan for my top match.",
];

function formatMessageTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SendIcon() {
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

export function AIChatPanel({ initialJobId }: AIChatPanelProps) {
  const uid = useId();
  const { pushToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId ?? null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialJobId !== undefined) {
      setSelectedJobId(initialJobId ?? null);
    }
  }, [initialJobId]);

  const loadContext = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoadingHistory(true);
    setLoadError(null);
    try {
      const [histRes, jobsRes] = await Promise.all([
        apiFetch<{ items: ChatMessage[] }>("/ai/chat/history"),
        apiFetch<JobListResponse>("/jobs?page_size=20&sort=score"),
      ]);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setMessages(histRes.items ?? []);
      setJobs(jobsRes.items ?? []);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setLoadError(
        err instanceof Error ? err.message : "Could not load conversation history and job context.",
      );
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setSendError(null);
    const optimisticUser: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
      job_id: selectedJobId,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    if (!textOverride) setInput("");
    setLoading(true);

    try {
      const res = await apiFetch<{ reply: string; message: ChatMessage }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, job_id: selectedJobId }),
      });
      setMessages((prev) => [...prev, res.message]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setSendError(msg);
      pushToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await apiFetch("/ai/chat/history", { method: "DELETE" });
      setMessages([]);
      setSendError(null);
      pushToast("Conversation cleared", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to clear chat", "error");
    } finally {
      setClearing(false);
    }
  };

  const contextSelectId = `${uid}-job-context`;
  const chatInputId = `${uid}-chat-input`;

  return (
    <section aria-label="AI Career Assistant">
      <Surface variant="elevated" radius="2xl" className="flex flex-col p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              AI Career Assistant
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Grounded in your active CV, ATS gaps, and live job matches
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={contextSelectId} className="sr-only">
              Target job context
            </label>
            <select
              id={contextSelectId}
              value={selectedJobId ?? ""}
              onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : null)}
              className="input-field min-h-[44px] max-w-[260px] py-1.5 text-xs sm:min-h-[38px]"
            >
              <option value="">General Career Context</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} @ {j.company} {j.score !== null ? `(${j.score}%)` : ""}
                </option>
              ))}
            </select>

            {messages.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                loading={clearing}
                disabled={clearing}
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          aria-live="polite"
          className="mb-4 h-96 space-y-3 overflow-y-auto rounded-2xl border border-hairline bg-canvas p-4 text-sm"
        >
          {loadingHistory ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Loading conversation"
              className="space-y-4"
            >
              <span className="sr-only">Loading conversation...</span>
              <div aria-hidden="true" className="flex justify-start">
                <div className="w-4/5 max-w-[56ch] space-y-2 rounded-2xl border border-hairline bg-subtle px-4 py-3">
                  <div className="h-3.5 w-full rounded-md bg-hover motion-safe:animate-pulse" />
                  <div className="h-3.5 w-3/4 rounded-md bg-hover motion-safe:animate-pulse" />
                </div>
              </div>
              <div aria-hidden="true" className="flex justify-end">
                <div className="w-2/3 max-w-[40ch] space-y-2 rounded-2xl bg-subtle px-4 py-3">
                  <div className="h-3.5 w-full rounded-md bg-hover motion-safe:animate-pulse" />
                </div>
              </div>
              <div aria-hidden="true" className="flex justify-start">
                <div className="w-3/4 max-w-[52ch] space-y-2 rounded-2xl border border-hairline bg-subtle px-4 py-3">
                  <div className="h-3.5 w-5/6 rounded-md bg-hover motion-safe:animate-pulse" />
                  <div className="h-3.5 w-2/3 rounded-md bg-hover motion-safe:animate-pulse" />
                </div>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <SectionState
                status="error"
                title="Could not load conversation context"
                description={loadError}
                onRetry={loadContext}
                className="w-full max-w-lg"
              />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <p className="max-w-[46ch] text-sm font-medium text-ink">
                Ask for CV improvements, missing skill strategy, or interview prep.
              </p>
              <p className="mt-1 max-w-[48ch] text-xs text-muted">
                Choose a job context above or start with a tailored prompt below.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => sendMessage(p)}
                    className="min-h-[44px] rounded-full border border-hairline bg-surface px-3.5 py-2 text-xs font-medium text-ink-secondary transition-colors duration-150 hover:border-accent/40 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-[36px]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const formattedTime = formatMessageTime(m.created_at);
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[75ch] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-[1.55] ${
                      m.role === "user"
                        ? "bg-accent text-accent-ink"
                        : "border border-hairline bg-subtle text-ink"
                    }`}
                  >
                    {m.content}
                  </div>
                  {formattedTime && (
                    <time
                      dateTime={m.created_at}
                      className="mt-1 px-1 font-mono text-[11px] tabular-nums text-muted"
                    >
                      {formattedTime}
                    </time>
                  )}
                </div>
              );
            })
          )}

          {loading && (
            <div
              role="status"
              aria-live="polite"
              aria-label="Analyzing profile and job context"
              className="flex justify-start"
            >
              <div className="w-full max-w-[44ch] space-y-2 rounded-2xl border border-hairline bg-subtle px-4 py-3">
                <span className="sr-only">Analyzing profile and job context...</span>
                <div
                  aria-hidden="true"
                  className="h-3.5 w-5/6 rounded-md bg-hover motion-safe:animate-pulse"
                />
                <div
                  aria-hidden="true"
                  className="h-3.5 w-2/3 rounded-md bg-hover motion-safe:animate-pulse"
                />
                <p className="pt-0.5 text-xs text-muted">Analyzing profile and job context...</p>
              </div>
            </div>
          )}
        </div>

        {sendError && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-status-danger-border bg-status-danger-bg px-3.5 py-2.5 text-xs text-status-danger-fg"
          >
            {sendError}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor={chatInputId} className="sr-only">
            Message AI Career Assistant
          </label>
          <input
            id={chatInputId}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (sendError) setSendError(null);
            }}
            className="input-field min-h-[44px]"
            placeholder="How can I improve my ATS score for ML Engineer roles?"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={loading || !input.trim()}
            className="min-h-[44px] shrink-0"
          >
            <span>Send</span>
            <SendIcon />
          </Button>
        </form>
      </Surface>
    </section>
  );
}
