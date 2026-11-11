"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { CVItem, UserProfile } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

const PRESET_TECHS = [
  "Python",
  "FastAPI",
  "LLM",
  "RAG",
  "PyTorch",
  "SQL",
  "PostgreSQL",
  "Docker",
  "Kubernetes",
  "AWS",
  "TypeScript",
  "React",
  "Next.js",
  "Spark",
  "Airflow",
  "dbt",
];

const STEPS = [
  { id: 1, label: "1. Profile" },
  { id: 2, label: "2. Stack & Preferences" },
  { id: 3, label: "3. CV Upload" },
] as const;

function CheckIcon({ className = "h-3.5 w-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
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

function PlusIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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

function OnboardingWizardInner() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { updateUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [headline, setHeadline] = useState("AI & Python Engineer");
  const [country, setCountry] = useState("France");
  const [preferredCountries, setPreferredCountries] = useState("France, Worldwide");
  const [cities, setCities] = useState("Paris, Lyon");
  const [experienceLevel, setExperienceLevel] = useState("mid");
  const [yearsExperience, setYearsExperience] = useState(3);
  const [preferredRoles, setPreferredRoles] = useState(
    "AI Engineer, Machine Learning Engineer, Backend Python Engineer",
  );
  const [technologies, setTechnologies] = useState<string[]>([
    "Python",
    "FastAPI",
    "LLM",
    "SQL",
    "Docker",
  ]);
  const [customTech, setCustomTech] = useState("");
  const [languages, setLanguages] = useState("English, French");
  const [salaryExpectation, setSalaryExpectation] = useState("65k-85k EUR");
  const [remotePreference, setRemotePreference] = useState<"any" | "remote" | "hybrid" | "onsite">(
    "hybrid",
  );
  const [visaRequired, setVisaRequired] = useState(false);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<CVItem | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileError("");
    try {
      const p = await apiFetch<UserProfile>("/profile");
      if (p.headline) setHeadline(p.headline);
      if (p.country) setCountry(p.country);
      if (p.preferred_countries?.length) setPreferredCountries(p.preferred_countries.join(", "));
      if (p.cities?.length) setCities(p.cities.join(", "));
      if (p.experience_level) setExperienceLevel(p.experience_level);
      setYearsExperience(p.years_experience ?? 3);
      if (p.preferred_roles?.length) setPreferredRoles(p.preferred_roles.join(", "));
      if (p.technologies?.length) setTechnologies(p.technologies);
      if (p.languages?.length) setLanguages(p.languages.join(", "));
      if (p.salary_expectation) setSalaryExpectation(p.salary_expectation);
      if (p.remote_preference) setRemotePreference(p.remote_preference);
      setVisaRequired(Boolean(p.visa_required));
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : "Could not load saved profile defaults. You can retry or continue with starter values.",
      );
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const toggleTech = (tech: string) => {
    setTechnologies((prev) =>
      prev.includes(tech) ? prev.filter((t) => t !== tech) : [...prev, tech],
    );
  };

  const addCustomTech = () => {
    const clean = customTech.trim();
    if (clean && !technologies.includes(clean)) {
      setTechnologies((prev) => [...prev, clean]);
    }
    setCustomTech("");
  };

  const applyParsedCvResult = (result: CVItem) => {
    setParsedPreview(result);
    if (result.parsed.skills.length) {
      setTechnologies((prev) => Array.from(new Set([...prev, ...result.parsed.skills])));
    }
    if (result.parsed.years_experience > 0) {
      setYearsExperience(result.parsed.years_experience);
    }
    if (result.parsed.languages?.length) {
      setLanguages((prev) => {
        const existing = prev
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return Array.from(new Set([...existing, ...result.parsed.languages])).join(", ");
      });
    }
  };

  const handleClearFile = () => {
    setCvFile(null);
    setParsedPreview(null);
    setActionError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (fileToUpload: File) => {
    setActionError("");
    setParsedPreview(null);
    setCvFile(fileToUpload);
    setUploadingCv(true);
    try {
      const form = new FormData();
      form.append("file", fileToUpload);
      form.append("set_primary", "true");
      const result = await apiFetch<CVItem>("/cvs/upload", { method: "POST", body: form });
      applyParsedCvResult(result);
      pushToast("CV uploaded and parsed!", "success");
    } catch (err) {
      setCvFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      const message = err instanceof Error ? err.message : "CV upload failed";
      setActionError(message);
      pushToast(message, "error");
    } finally {
      setUploadingCv(false);
    }
  };

  const handlePasteCvParse = async () => {
    const trimmed = cvText.trim();
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
    setActionError("");
    setCvFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setParsedPreview(null);
    setUploadingCv(true);
    try {
      const result = await apiFetch<CVItem>("/cvs/from-text", {
        method: "POST",
        body: JSON.stringify({
          filename: "onboarding-cv.txt",
          text: trimmed,
          set_primary: true,
        }),
      });
      applyParsedCvResult(result);
      pushToast("CV uploaded and parsed!", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "CV parsing failed";
      setActionError(message);
      pushToast(message, "error");
    } finally {
      setUploadingCv(false);
    }
  };

  const handleFinish = async () => {
    setActionError("");
    const trimmedCvText = cvText.trim();
    if (!parsedPreview && !cvFile && trimmedCvText && trimmedCvText.length < 15) {
      const message = "Please paste at least 15 characters of CV text before finishing.";
      setActionError(message);
      pushToast(message, "error");
      return;
    }

    setSaving(true);
    try {
      let mergedTechs = technologies;
      let mergedYears = Number(yearsExperience);
      let mergedLanguages = languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!parsedPreview && (cvFile || trimmedCvText)) {
        let uploaded: CVItem;
        if (cvFile) {
          const form = new FormData();
          form.append("file", cvFile);
          form.append("set_primary", "true");
          uploaded = await apiFetch<CVItem>("/cvs/upload", { method: "POST", body: form });
        } else {
          uploaded = await apiFetch<CVItem>("/cvs/from-text", {
            method: "POST",
            body: JSON.stringify({
              filename: "onboarding-cv.txt",
              text: trimmedCvText,
              set_primary: true,
            }),
          });
        }
        setParsedPreview(uploaded);
        if (uploaded.parsed.skills.length) {
          mergedTechs = Array.from(new Set([...mergedTechs, ...uploaded.parsed.skills]));
          setTechnologies(mergedTechs);
        }
        if (uploaded.parsed.years_experience > 0) {
          mergedYears = uploaded.parsed.years_experience;
          setYearsExperience(mergedYears);
        }
        if (uploaded.parsed.languages?.length) {
          mergedLanguages = Array.from(new Set([...mergedLanguages, ...uploaded.parsed.languages]));
          setLanguages(mergedLanguages.join(", "));
        }
      }

      await apiFetch("/profile/complete-onboarding", {
        method: "POST",
        body: JSON.stringify({
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
          years_experience: mergedYears,
          preferred_roles: preferredRoles
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          technologies: mergedTechs,
          languages: mergedLanguages,
          salary_expectation: salaryExpectation,
          remote_preference: remotePreference,
          visa_required: visaRequired,
        }),
      });
      updateUser({ onboarding_completed: true });
      pushToast("Profile saved and matches computed!", "success");
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save onboarding profile";
      setActionError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="onboarding-heading" className="mx-auto max-w-3xl py-4 sm:py-6">
      <Surface variant="elevated" radius="3xl" className="p-6 sm:p-8">
        <div className="space-y-5 border-b border-hairline pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-mono text-xs font-medium tabular-nums text-muted">
                Step {step} of 3
              </p>
              <h1
                id="onboarding-heading"
                className="mt-1 font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
              >
                Onboarding Wizard
              </h1>
            </div>
            <p className="text-xs text-ink-secondary">
              Tailor ATS scoring, role alerts, and resume parsing.
            </p>
          </div>

          <nav aria-label="Onboarding steps" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STEPS.map((s) => {
              const isCurrent = step === s.id;
              const isCompleted = s.id < step;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isCurrent
                      ? "border-[rgb(var(--accent)/0.35)] bg-accent-soft font-semibold text-accent-soft-ink"
                      : isCompleted
                        ? "border-hairline bg-surface text-ink hover:bg-subtle"
                        : "border-hairline bg-subtle/75 text-ink-secondary hover:bg-hover hover:text-ink"
                  }`}
                >
                  {isCompleted && <CheckIcon />}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {profileError && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] px-4 py-3 text-xs leading-5 text-[rgb(var(--status-danger-fg))]"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircleIcon />
              <span>{profileError}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={loadProfile}>
              Retry
            </Button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] px-4 py-3 text-xs leading-5 text-[rgb(var(--status-danger-fg))]"
          >
            <AlertCircleIcon />
            <span>{actionError}</span>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label
                htmlFor="onboarding-headline"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Professional Headline
              </label>
              <input
                id="onboarding-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label
                htmlFor="onboarding-country"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Current Country
              </label>
              <input
                id="onboarding-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label
                htmlFor="onboarding-preferred-countries"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Preferred Countries (comma-separated)
              </label>
              <input
                id="onboarding-preferred-countries"
                value={preferredCountries}
                onChange={(e) => setPreferredCountries(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label
                htmlFor="onboarding-cities"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Target Cities
              </label>
              <input
                id="onboarding-cities"
                value={cities}
                onChange={(e) => setCities(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="onboarding-experience-level"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Experience Level
                </label>
                <select
                  id="onboarding-experience-level"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="input-field"
                >
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead / Staff</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="onboarding-years-experience"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Years Experience
                </label>
                <input
                  id="onboarding-years-experience"
                  type="number"
                  min={0}
                  max={45}
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(Number(e.target.value))}
                  className="input-field font-mono tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="onboarding-preferred-roles"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Preferred Roles
                </label>
                <input
                  id="onboarding-preferred-roles"
                  value={preferredRoles}
                  onChange={(e) => setPreferredRoles(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label
                  htmlFor="onboarding-languages"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Languages
                </label>
                <input
                  id="onboarding-languages"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label
                  htmlFor="onboarding-salary"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Salary Expectation
                </label>
                <input
                  id="onboarding-salary"
                  value={salaryExpectation}
                  onChange={(e) => setSalaryExpectation(e.target.value)}
                  className="input-field font-mono tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="onboarding-remote-preference"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Remote Preference
                </label>
                <select
                  id="onboarding-remote-preference"
                  value={remotePreference}
                  onChange={(e) =>
                    setRemotePreference(e.target.value as "any" | "remote" | "hybrid" | "onsite")
                  }
                  className="input-field"
                >
                  <option value="any">Any</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>
            </div>

            <label
              htmlFor="onboarding-visa-required"
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-secondary sm:min-h-0"
            >
              <input
                id="onboarding-visa-required"
                type="checkbox"
                checked={visaRequired}
                onChange={(e) => setVisaRequired(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-[rgb(var(--accent))]"
              />
              <span>Require visa sponsorship</span>
            </label>

            <div>
              <p className="mb-2.5 text-xs font-medium text-muted">Technologies &amp; Skills</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...PRESET_TECHS, ...technologies])).map((tech) => {
                  const active = technologies.includes(tech);
                  return (
                    <button
                      key={tech}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTech(tech)}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-h-[36px] ${
                        active
                          ? "border-[rgb(var(--accent)/0.35)] bg-accent-soft text-accent-soft-ink"
                          : "border-hairline bg-subtle text-ink-secondary hover:bg-hover hover:text-ink"
                      }`}
                    >
                      {active ? <CheckIcon /> : <PlusIcon />}
                      <span>{tech}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
                <label htmlFor="onboarding-custom-tech" className="sr-only">
                  Add custom skill
                </label>
                <input
                  id="onboarding-custom-tech"
                  value={customTech}
                  onChange={(e) => setCustomTech(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTech();
                    }
                  }}
                  placeholder="Add custom skill (e.g. LangGraph, Ray)..."
                  className="input-field"
                />
                <Button variant="secondary" size="md" onClick={addCustomTech} className="shrink-0">
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (uploadingCv) return;
                const dropped = e.dataTransfer?.files?.[0] || null;
                if (dropped) {
                  handleFileUpload(dropped);
                }
              }}
              className={`rounded-2xl border border-dashed p-6 text-center transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface ${
                isDragging ? "border-accent bg-accent-soft/40" : "border-input bg-subtle/60"
              }`}
            >
              <div
                aria-hidden="true"
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(var(--accent)/0.25)] bg-accent-soft text-accent"
              >
                <UploadIcon />
              </div>

              <label
                htmlFor="onboarding-cv-file"
                className="mt-3 block cursor-pointer text-sm font-semibold text-ink"
              >
                Upload your CV (PDF, DOCX, TXT, or MD)
              </label>
              <p className="mt-1 text-xs leading-[1.55] text-ink-secondary">
                Stored encrypted at rest and parsed immediately for ATS matching.
              </p>

              <input
                ref={fileInputRef}
                id="onboarding-cv-file"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                disabled={uploadingCv}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  e.target.value = "";
                  if (f) handleFileUpload(f);
                }}
                className="sr-only"
              />

              <div className="mt-4 flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  loading={uploadingCv}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px]"
                >
                  {uploadingCv
                    ? "Parsing CV..."
                    : cvFile
                      ? "Choose Another File"
                      : "Choose CV File"}
                </Button>
                {cvFile && (
                  <div className="flex w-full min-w-0 flex-col items-center gap-1">
                    <p className="w-full min-w-0 break-all text-xs font-medium text-ink-secondary">
                      Selected: <span className="font-mono text-ink">{cvFile.name}</span>
                    </p>
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      disabled={uploadingCv}
                      onClick={handleClearFile}
                    >
                      Clear file
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="onboarding-cv-text"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Or paste CV text directly
              </label>
              <textarea
                id="onboarding-cv-text"
                rows={4}
                value={cvText}
                onChange={(e) => {
                  const next = e.target.value;
                  setCvText(next);
                  setParsedPreview(null);
                  setActionError("");
                  if (next.trim()) {
                    setCvFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }
                }}
                className="input-field"
                placeholder="Paste summary, experience, and skills (minimum 15 characters)..."
              />
              <p className="mt-1.5 text-xs text-muted">
                Minimum 15 characters required for resume parsing.
              </p>
              {cvText.trim() && (
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploadingCv}
                    onClick={handlePasteCvParse}
                  >
                    {uploadingCv ? "Parsing CV..." : "Parse Pasted CV Now"}
                  </Button>
                  <span className="text-xs text-muted">
                    Or click Finish &amp; Open Dashboard — your pasted CV will be parsed
                    automatically.
                  </span>
                </div>
              )}
            </div>

            {parsedPreview && (
              <div className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--status-success-border))] bg-[rgb(var(--status-success-bg))] p-4 text-xs text-[rgb(var(--status-success-fg))]">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="w-full min-w-0 break-all font-semibold text-ink">
                    Parsed {parsedPreview.filename}
                  </p>
                  <p className="mt-1 leading-[1.55]">
                    Skills: {parsedPreview.parsed.skills.join(", ") || "None detected"} ·
                    Experience:{" "}
                    <span className="font-mono tabular-nums">
                      {parsedPreview.parsed.years_experience} yrs
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            Back
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setStep((s) => Math.min(3, s + 1))}
            >
              <span>Continue</span>
              <ArrowRightIcon />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={saving}
              disabled={saving || uploadingCv}
              onClick={handleFinish}
            >
              {saving ? "Saving & Scoring..." : "Finish & Open Dashboard"}
            </Button>
          )}
        </div>
      </Surface>
    </section>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGate
      title="Sign in to set up your job profile"
      subtitle="Your onboarding preferences drive daily ATS scores and email digests."
    >
      <OnboardingWizardInner />
    </AuthGate>
  );
}
