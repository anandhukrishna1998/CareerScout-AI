"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScoreRing } from "@/components/ui/score-ring";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { TokenPair } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

const SAMPLE_MATCHED_SKILLS = ["Python", "FastAPI", "LLM", "RAG", "PostgreSQL", "Docker"];

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

function WarningIcon() {
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
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { user, setSession } = useAuthStore();
  const { pushToast } = useToast();
  const [demoLoading, setDemoLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSignedIn = mounted && Boolean(user);

  const handleLaunchDemo = async () => {
    if (user) {
      router.push("/dashboard");
      return;
    }
    setDemoLoading(true);
    try {
      const pair = await apiFetch<TokenPair>("/auth/demo", { method: "POST", skipAuth: true });
      setSession(pair);
      pushToast("Demo workspace initialized!", "success");
      router.push("/dashboard");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not launch demo", "error");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="space-y-14 py-8 md:py-14">
      <section
        aria-labelledby="hero-heading"
        className="grid items-center gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10"
      >
        <div>
          <Badge tone="accent" className="mb-5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span>AI-native job intelligence</span>
          </Badge>

          <h1
            id="hero-heading"
            className="font-display text-[clamp(2.25rem,4vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-ink"
          >
            Discover the best AI &amp; Data jobs matched to your CV daily.
          </h1>

          <p className="mt-5 max-w-[54ch] text-base leading-[1.6] text-ink-secondary">
            CareerScout continuously aggregates live tech openings, scores hybrid ATS fit against
            your encrypted resume, identifies missing skills, and prepares tailored daily digests.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={isSignedIn ? "/dashboard" : "/auth/register"}
              className="btn-primary min-h-[44px] sm:min-h-[40px]"
            >
              {isSignedIn ? "Open Dashboard" : "Get Started Free"}
            </Link>
            <Button variant="secondary" size="md" loading={demoLoading} onClick={handleLaunchDemo}>
              {demoLoading ? "Launching Demo..." : "View Live Demo"}
            </Button>
            <Link href="/jobs" className="btn-quiet min-h-[44px] sm:min-h-[40px]">
              Explore Jobs
            </Link>
          </div>
        </div>

        <aside aria-label="Sample ATS Match Dossier">
          <Surface variant="hero" radius="3xl" className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted">Sample ATS Match Dossier</span>
                  <Badge tone="success">Strong Fit</Badge>
                </div>
                <h2 className="mt-2.5 font-display text-xl font-semibold tracking-[-0.015em] text-ink">
                  Senior AI &amp; LLM Engineer
                </h2>
                <p className="mt-1 text-sm text-ink-secondary">
                  Paris · Hybrid · <span className="font-mono tabular-nums">75k–95k EUR</span> · CDI
                </p>
              </div>
              <ScoreRing score={91} size="md" className="shrink-0" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y border-hairline py-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Skills</span>
                <span className="font-mono font-semibold tabular-nums text-ink">54/60</span>
              </div>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Semantic</span>
                <span className="font-mono font-semibold tabular-nums text-ink">23/25</span>
              </div>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Exp</span>
                <span className="font-mono font-semibold tabular-nums text-ink">14/15</span>
              </div>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Matched core stack</p>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_MATCHED_SKILLS.map((skill) => (
                    <Badge key={skill} tone="accent">
                      <CheckIcon />
                      <span>{skill}</span>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted">Gaps surfaced</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="warning">
                    <WarningIcon />
                    <span>Missing: Kubernetes</span>
                  </Badge>
                  <Badge tone="neutral">AWS</Badge>
                </div>
              </div>
            </div>
          </Surface>
        </aside>
      </section>

      <MotionReveal delay={0.04}>
        <section aria-labelledby="capabilities-heading" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2
              id="capabilities-heading"
              className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink"
            >
              Built for calm, transparent job matching
            </h2>
            <p className="max-w-[54ch] text-sm leading-[1.55] text-ink-secondary">
              Every role is indexed, evaluated against your primary CV, and organized into a clear
              application workflow.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Surface
              variant="elevated"
              radius="2xl"
              className="flex flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-7"
            >
              <div>
                <h3 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Explainable Hybrid ATS Scoring
                </h3>
                <p className="mt-2 max-w-[60ch] text-sm leading-[1.6] text-ink-secondary">
                  Hybrid keyword and semantic similarity scoring surfaces exact strengths, missing
                  requirements, and tailored cover letter drafts without black-box guesswork.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-subtle px-4 py-3 text-xs">
                <span className="font-mono font-medium tabular-nums text-ink">
                  Skills <span className="text-accent-text">60 pts</span>
                </span>
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <span className="font-mono font-medium tabular-nums text-ink">
                  Semantic <span className="text-accent-text">25 pts</span>
                </span>
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <span className="font-mono font-medium tabular-nums text-ink">
                  Experience <span className="text-accent-text">15 pts</span>
                </span>
              </div>
            </Surface>

            <Surface
              variant="subtle"
              radius="2xl"
              className="flex flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-5"
            >
              <div>
                <h3 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Encrypted CV Parsing
                </h3>
                <p className="mt-2 text-sm leading-[1.6] text-ink-secondary">
                  Upload PDF, DOCX, TXT, or Markdown resumes to extract skills, languages, and true
                  experience span while keeping files encrypted at rest.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["PDF", "DOCX", "TXT", "MD"].map((fmt) => (
                  <Badge key={fmt} tone="neutral" className="font-mono">
                    {fmt}
                  </Badge>
                ))}
              </div>
            </Surface>

            <Surface
              variant="subtle"
              radius="2xl"
              className="flex flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-5"
            >
              <div>
                <h3 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Multi-Source Live Aggregation
                </h3>
                <p className="mt-2 text-sm leading-[1.6] text-ink-secondary">
                  Continuous ingestion across RemoteOK, Arbeitnow, Remotive, WeWorkRemotely,
                  Greenhouse, Lever, and France Travail.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Greenhouse", "Lever", "RemoteOK", "France Travail"].map((src) => (
                  <Badge key={src} tone="neutral">
                    {src}
                  </Badge>
                ))}
              </div>
            </Surface>

            <Surface
              variant="elevated"
              radius="2xl"
              className="flex flex-col justify-between gap-5 p-6 sm:p-7 lg:col-span-7"
            >
              <div>
                <h3 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  Daily Digest &amp; Pipeline Tracker
                </h3>
                <p className="mt-2 max-w-[60ch] text-sm leading-[1.6] text-ink-secondary">
                  Move roles cleanly from bookmark to offer and receive scheduled HTML digests
                  filtered to your minimum ATS threshold.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-subtle px-4 py-3 text-xs font-medium text-ink">
                <Badge tone="neutral">Saved</Badge>
                <ChevronRightIcon />
                <Badge tone="accent">Applied</Badge>
                <ChevronRightIcon />
                <Badge tone="success">Interviewing</Badge>
                <ChevronRightIcon />
                <Badge tone="success">Offer</Badge>
              </div>
            </Surface>
          </div>
        </section>
      </MotionReveal>
    </div>
  );
}
