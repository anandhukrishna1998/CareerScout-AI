"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/components/ui/section-state";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

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

function ProfileSettingsContent() {
  const uid = useId();
  const { pushToast } = useToast();
  const { accessToken, updateUser } = useAuthStore();
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [country, setCountry] = useState("");
  const [preferredCountries, setPreferredCountries] = useState("");
  const [cities, setCities] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("mid");
  const [yearsExperience, setYearsExperience] = useState(0);
  const [preferredRoles, setPreferredRoles] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [languages, setLanguages] = useState("");
  const [salaryExpectation, setSalaryExpectation] = useState("");
  const [remotePreference, setRemotePreference] = useState<"any" | "remote" | "hybrid" | "onsite">(
    "hybrid",
  );
  const [visaRequired, setVisaRequired] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadError("");
    try {
      const p = await apiFetch<UserProfile>("/profile", { signal: controller.signal });
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setFullName(p.full_name || "");
      setHeadline(p.headline || "");
      setCountry(p.country || "");
      setPreferredCountries((p.preferred_countries || []).join(", "));
      setCities((p.cities || []).join(", "));
      setExperienceLevel(p.experience_level || "mid");
      setYearsExperience(p.years_experience || 0);
      setPreferredRoles((p.preferred_roles || []).join(", "));
      setTechnologies((p.technologies || []).join(", "));
      setLanguages((p.languages || []).join(", "));
      setSalaryExpectation(p.salary_expectation || "");
      setRemotePreference(p.remote_preference || "hybrid");
      setVisaRequired(Boolean(p.visa_required));
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load profile";
      setLoadError(message);
      pushToast(message, "error");
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [pushToast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, accessToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<UserProfile>("/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: fullName,
          headline,
          country,
          preferred_countries: preferredCountries
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          cities: cities
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          experience_level: experienceLevel,
          years_experience: Number(yearsExperience),
          preferred_roles: preferredRoles
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          technologies: technologies
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          languages: languages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          salary_expectation: salaryExpectation,
          remote_preference: remotePreference,
          visa_required: visaRequired,
        }),
      });
      if (!mountedRef.current) return;
      updateUser({ full_name: updated.full_name });
      pushToast("Profile saved & ATS matches recalculated!", "success");
    } catch (err) {
      if (!mountedRef.current) return;
      pushToast(err instanceof Error ? err.message : "Failed to save profile", "error");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changingPw) return;
    setPasswordError("");
    if (newPassword.length < 8) {
      const message = "New password must be at least 8 characters";
      setPasswordError(message);
      pushToast(message, "error");
      return;
    }
    setChangingPw(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!mountedRef.current) return;
      setCurrentPassword("");
      setNewPassword("");
      pushToast("Password updated!", "success");
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Password change failed";
      setPasswordError(message);
      pushToast(message, "error");
    } finally {
      if (mountedRef.current) {
        setChangingPw(false);
      }
    }
  };

  const fullNameId = `${uid}-full-name`;
  const headlineId = `${uid}-headline`;
  const countryId = `${uid}-country`;
  const preferredCountriesId = `${uid}-preferred-countries`;
  const citiesId = `${uid}-cities`;
  const expLevelId = `${uid}-experience-level`;
  const yearsExpId = `${uid}-years-experience`;
  const preferredRolesId = `${uid}-preferred-roles`;
  const languagesId = `${uid}-languages`;
  const technologiesId = `${uid}-technologies`;
  const salaryId = `${uid}-salary`;
  const remotePrefId = `${uid}-remote-preference`;
  const visaId = `${uid}-visa-required`;
  const currentPwId = `${uid}-current-password`;
  const newPwId = `${uid}-new-password`;

  return (
    <section
      aria-labelledby="profile-settings-heading"
      className="w-full min-w-0 space-y-6 md:space-y-8"
    >
      <div className="min-w-0">
        <h1
          id="profile-settings-heading"
          className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Profile Settings
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Manage location, target technologies, salary expectations, and visa preferences.
        </p>
      </div>

      {loading ? (
        <SectionState
          status="loading"
          title="Loading profile settings"
          description="Fetching your preferences, target markets, and technical stack."
          skeletonLines={6}
        />
      ) : loadError ? (
        <SectionState
          status="error"
          title="Could not load profile settings"
          description={loadError}
          onRetry={loadProfile}
        />
      ) : (
        <div className="space-y-6">
          <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              Preferences &amp; Matching Stack
            </h2>
            <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={fullNameId} className="mb-1.5 block text-xs font-medium text-muted">
                  Full Name
                </label>
                <input
                  id={fullNameId}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={headlineId} className="mb-1.5 block text-xs font-medium text-muted">
                  Headline
                </label>
                <input
                  id={headlineId}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={countryId} className="mb-1.5 block text-xs font-medium text-muted">
                  Country
                </label>
                <input
                  id={countryId}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label
                  htmlFor={preferredCountriesId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Preferred Countries
                </label>
                <input
                  id={preferredCountriesId}
                  value={preferredCountries}
                  onChange={(e) => setPreferredCountries(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={citiesId} className="mb-1.5 block text-xs font-medium text-muted">
                  Target Cities
                </label>
                <input
                  id={citiesId}
                  value={cities}
                  onChange={(e) => setCities(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label
                    htmlFor={expLevelId}
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Experience Level
                  </label>
                  <select
                    id={expLevelId}
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="input-field"
                  >
                    <option value="junior">Junior</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="lead">Lead / Staff</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label
                    htmlFor={yearsExpId}
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Years Experience
                  </label>
                  <input
                    id={yearsExpId}
                    type="number"
                    min={0}
                    max={45}
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(Number(e.target.value))}
                    className="input-field font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor={preferredRolesId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Preferred Roles
                </label>
                <input
                  id={preferredRolesId}
                  value={preferredRoles}
                  onChange={(e) => setPreferredRoles(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label
                  htmlFor={languagesId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Languages
                </label>
                <input
                  id={languagesId}
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0 md:col-span-2">
                <label
                  htmlFor={technologiesId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Core Technologies (comma-separated)
                </label>
                <input
                  id={technologiesId}
                  value={technologies}
                  onChange={(e) => setTechnologies(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={salaryId} className="mb-1.5 block text-xs font-medium text-muted">
                  Salary Expectation
                </label>
                <input
                  id={salaryId}
                  value={salaryExpectation}
                  onChange={(e) => setSalaryExpectation(e.target.value)}
                  className="input-field font-mono tabular-nums"
                />
              </div>

              <div className="min-w-0">
                <label
                  htmlFor={remotePrefId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Remote Preference
                </label>
                <select
                  id={remotePrefId}
                  value={remotePreference}
                  onChange={(e) =>
                    setRemotePreference(e.target.value as UserProfile["remote_preference"])
                  }
                  className="input-field"
                >
                  <option value="any">Any</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>

              <label
                htmlFor={visaId}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-secondary md:col-span-2"
              >
                <input
                  id={visaId}
                  type="checkbox"
                  checked={visaRequired}
                  onChange={(e) => setVisaRequired(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-[rgb(var(--accent))]"
                />
                <span>Require visa sponsorship</span>
              </label>

              <div className="md:col-span-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={saving}
                  className="min-h-[44px]"
                >
                  {saving ? "Saving..." : "Save Profile Preferences"}
                </Button>
              </div>
            </form>
          </Surface>

          <Surface variant="elevated" radius="2xl" className="min-w-0 p-5 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-semibold tracking-[-0.015em] text-ink">
              Security · Change Password
            </h2>

            {passwordError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-3 text-xs leading-5 text-status-danger-fg"
              >
                <AlertCircleIcon />
                <span>{passwordError}</span>
              </div>
            )}

            <form
              onSubmit={handlePasswordChange}
              className="grid gap-4 md:grid-cols-3 md:items-end"
            >
              <div className="min-w-0">
                <label
                  htmlFor={currentPwId}
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Current Password
                </label>
                <input
                  id={currentPwId}
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="Enter current password"
                  className="input-field"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={newPwId} className="mb-1.5 block text-xs font-medium text-muted">
                  New Password
                </label>
                <input
                  id={newPwId}
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="New password (8+ chars)"
                  className="input-field"
                />
              </div>

              <div>
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  loading={changingPw}
                  disabled={changingPw}
                  className="min-h-[44px] w-full"
                >
                  {changingPw ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          </Surface>
        </div>
      )}
    </section>
  );
}

export default function ProfileSettingsPage() {
  return (
    <AuthGate>
      <ProfileSettingsContent />
    </AuthGate>
  );
}
