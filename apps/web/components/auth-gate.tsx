"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import type { TokenPair } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "./providers";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";

export type AuthGateProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
};

function BotanicalKeyIcon() {
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
      <rect x="4" y="11" width="16" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AuthGate({
  children,
  title = "Sign in to access your workspace",
  subtitle = "Upload your CV, explore personalized ATS job scores, and save opportunities.",
}: AuthGateProps) {
  const { accessToken, hydrated, setSession } = useAuthStore();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!hydrated) {
    return (
      <Surface
        variant="elevated"
        radius="3xl"
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto max-w-xl p-7 sm:p-8"
      >
        <span className="sr-only">Loading workspace session...</span>
        <div aria-hidden="true" className="flex flex-col items-center space-y-4">
          <div className="h-11 w-11 rounded-full bg-subtle motion-safe:animate-pulse" />
          <div className="h-6 w-60 rounded-lg bg-subtle motion-safe:animate-pulse" />
          <div className="h-4 w-full max-w-sm rounded-md bg-subtle motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 max-w-xs rounded-md bg-subtle motion-safe:animate-pulse" />
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <div className="h-10 w-44 rounded-full bg-subtle motion-safe:animate-pulse" />
            <div className="h-10 w-24 rounded-full bg-subtle motion-safe:animate-pulse" />
          </div>
        </div>
      </Surface>
    );
  }

  if (!accessToken) {
    const handleDemo = async () => {
      setLoading(true);
      try {
        const pair = await apiFetch<TokenPair>("/auth/demo", { method: "POST", skipAuth: true });
        setSession(pair);
        pushToast("Demo workspace loaded with pre-parsed CV & live ATS scores", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Could not load demo session", "error");
      } finally {
        setLoading(false);
      }
    };

    return (
      <Surface variant="hero" radius="3xl" className="mx-auto max-w-xl p-7 text-center sm:p-8">
        <div
          aria-hidden="true"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(var(--accent)/0.22)] bg-accent-soft text-accent"
        >
          <BotanicalKeyIcon />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[46ch] text-sm leading-[1.55] text-ink-secondary">
          {subtitle}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            loading={loading}
            onClick={handleDemo}
            className="min-h-[44px]"
          >
            {loading ? "Loading Demo..." : "Continue with Demo Account"}
          </Button>
          <Link href="/auth/login" className="btn-secondary min-h-[44px] sm:min-h-[40px]">
            Sign in
          </Link>
          <Link href="/auth/register" className="btn-secondary min-h-[44px] sm:min-h-[40px]">
            Create Account
          </Link>
        </div>
      </Surface>
    );
  }

  return <>{children}</>;
}
