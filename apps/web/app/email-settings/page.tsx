"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { EmailLog, EmailSettings } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

function formatDeliveryTimestamp(raw?: string | null): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function EmailSettingsContent() {
  const uid = useId();
  const { pushToast } = useToast();
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const { user } = useAuthStore();
  const userId = user?.id ?? null;
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const actionInFlightRef = useRef(false);

  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const loadAll = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const [sRes, lRes, pRes] = await Promise.all([
        apiFetch<EmailSettings>("/email-settings", { signal: controller.signal }),
        apiFetch<{ items: EmailLog[] }>("/email-settings/logs", { signal: controller.signal }),
        apiFetch<{ html: string }>("/email-settings/preview", { signal: controller.signal }),
      ]);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setSettings(sRes);
      setLogs(Array.isArray(lRes?.items) ? lRes.items : []);
      setPreviewHtml(pRes?.html ?? "");
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Could not load email settings";
      setSettings(null);
      setError(message);
      pushToastRef.current(message, "error");
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, userId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || saving || sendingTest || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setSaving(true);
    try {
      const updated = await apiFetch<EmailSettings>("/email-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      if (!mountedRef.current) return;
      setSettings(updated);
      pushToast("Email digest settings saved!", "success");
      try {
        const prev = await apiFetch<{ html: string }>("/email-settings/preview");
        if (!mountedRef.current) return;
        setPreviewHtml(prev?.html ?? "");
      } catch {
        if (!mountedRef.current) return;
        pushToast("Settings saved, but preview refresh failed.", "info");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSendTest = async () => {
    if (sendingTest || saving || !settings || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setSendingTest(true);
    try {
      const res = await apiFetch<{
        status: string;
        provider: string;
        job_count: number;
        preview_html: string;
      }>("/email-settings/test-digest", { method: "POST" });
      if (!mountedRef.current) return;
      setPreviewHtml(res.preview_html);
      pushToast(
        `Digest ${res.status} (${res.job_count} jobs via ${res.provider})`,
        res.status === "failed" ? "error" : "success",
      );
      try {
        const lRes = await apiFetch<{ items: EmailLog[] }>("/email-settings/logs");
        if (!mountedRef.current) return;
        setLogs(Array.isArray(lRes?.items) ? lRes.items : []);
      } catch {
        // Non-fatal: test digest succeeded even if log refresh fails
      }
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Test digest failed", "error");
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) {
        setSendingTest(false);
      }
    }
  };

  const digestEnabledId = `${uid}-digest-enabled`;
  const recipientEmailId = `${uid}-recipient-email`;
  const subjectId = `${uid}-subject-template`;
  const frequencyId = `${uid}-frequency`;
  const sendHourId = `${uid}-send-hour`;
  const timezoneId = `${uid}-timezone`;
  const minScoreId = `${uid}-min-score`;
  const maxJobsId = `${uid}-max-jobs`;

  return (
    <section
      aria-labelledby="email-settings-heading"
      className="w-full min-w-0 space-y-6 md:space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="email-settings-heading"
            className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
          >
            Email Settings
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Configure automated daily job match digests &amp; preview email layout.
          </p>
        </div>

        {settings && !error && (
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={sendingTest}
            disabled={loading || saving || sendingTest}
            onClick={handleSendTest}
            className="min-h-[44px]"
          >
            {sendingTest ? "Dispatching..." : "Send Test Digest Now"}
          </Button>
        )}
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Loading email configuration"
          description="Fetching your digest preferences, live HTML preview, and recent delivery logs."
          skeletonLines={6}
        />
      ) : error || !settings ? (
        <SectionState
          status="error"
          title="Could not load email settings"
          description={error || "Email configuration is unavailable."}
          onRetry={loadAll}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
              <form onSubmit={handleSave} className="space-y-4">
                <label
                  htmlFor={digestEnabledId}
                  className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 border-b border-hairline pb-3 text-sm font-medium text-ink"
                >
                  <span>Enable Daily Job Digest</span>
                  <input
                    id={digestEnabledId}
                    type="checkbox"
                    checked={settings.digest_enabled}
                    onChange={(e) => setSettings({ ...settings, digest_enabled: e.target.checked })}
                    className="h-5 w-5 cursor-pointer rounded border-input accent-[rgb(var(--accent))]"
                  />
                </label>

                <div>
                  <label
                    htmlFor={recipientEmailId}
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Recipient Email
                  </label>
                  <input
                    id={recipientEmailId}
                    type="email"
                    value={settings.recipient_email}
                    onChange={(e) => setSettings({ ...settings, recipient_email: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label
                    htmlFor={subjectId}
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Subject Line
                  </label>
                  <input
                    id={subjectId}
                    value={settings.subject_template}
                    onChange={(e) => setSettings({ ...settings, subject_template: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label
                      htmlFor={frequencyId}
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Cadence
                    </label>
                    <select
                      id={frequencyId}
                      value={settings.frequency}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          frequency: e.target.value as EmailSettings["frequency"],
                        })
                      }
                      className="input-field"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor={sendHourId}
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Hour (0–23)
                    </label>
                    <input
                      id={sendHourId}
                      type="number"
                      min={0}
                      max={23}
                      value={settings.send_hour}
                      onChange={(e) =>
                        setSettings({ ...settings, send_hour: Number(e.target.value) })
                      }
                      className="input-field font-mono tabular-nums"
                    />
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor={timezoneId}
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Timezone
                    </label>
                    <input
                      id={timezoneId}
                      value={settings.timezone}
                      onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label
                      htmlFor={minScoreId}
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Min Match Score (
                      <span className="font-mono tabular-nums text-ink">
                        {settings.min_match_score}%
                      </span>
                      )
                    </label>
                    <input
                      id={minScoreId}
                      type="range"
                      min={0}
                      max={95}
                      step={5}
                      value={settings.min_match_score}
                      onChange={(e) =>
                        setSettings({ ...settings, min_match_score: Number(e.target.value) })
                      }
                      className="min-h-[44px] w-full cursor-pointer accent-[rgb(var(--accent))]"
                    />
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor={maxJobsId}
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Max Jobs per Email
                    </label>
                    <input
                      id={maxJobsId}
                      type="number"
                      min={1}
                      max={25}
                      value={settings.max_jobs_per_email}
                      onChange={(e) =>
                        setSettings({ ...settings, max_jobs_per_email: Number(e.target.value) })
                      }
                      className="input-field font-mono tabular-nums"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={saving || sendingTest}
                  className="min-h-[44px] w-full"
                >
                  {saving ? "Saving..." : "Save Digest Preferences"}
                </Button>
              </form>
            </Surface>

            <Surface variant="elevated" radius="2xl" className="min-w-0 space-y-3 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Live Email Preview
                </h2>
                <Badge tone="neutral">Light Digest</Badge>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-2xl border border-hairline bg-subtle p-3">
                <iframe
                  title="Email digest preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="h-[390px] w-full rounded-xl bg-transparent"
                />
              </div>
            </Surface>
          </div>

          <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              Recent Digest Deliveries
            </h2>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No digests sent yet. Click &quot;Send Test Digest Now&quot; to test delivery.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-xs">
                  <thead className="border-b border-hairline text-muted">
                    <tr>
                      <th className="py-2.5 pr-4 font-medium">Recipient</th>
                      <th className="py-2.5 pr-4 font-medium">Jobs</th>
                      <th className="py-2.5 pr-4 font-medium">Provider</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 font-medium">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-ink-secondary">
                    {logs.map((l) => (
                      <tr key={l.id} className="transition-colors hover:bg-subtle/50">
                        <td className="break-all py-2.5 pr-4 font-medium text-ink">
                          {l.recipient_email}
                        </td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums text-ink">
                          {l.job_count}
                        </td>
                        <td className="py-2.5 pr-4">{l.provider}</td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            tone={
                              l.status === "sent"
                                ? "success"
                                : l.status === "failed"
                                  ? "danger"
                                  : "neutral"
                            }
                            className="capitalize"
                          >
                            {l.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-mono tabular-nums text-muted">
                          {formatDeliveryTimestamp(l.sent_at)}
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

export default function EmailSettingsPage() {
  return (
    <AuthGate>
      <EmailSettingsContent />
    </AuthGate>
  );
}
