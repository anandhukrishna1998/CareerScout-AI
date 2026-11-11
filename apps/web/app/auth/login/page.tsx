"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api";
import type { TokenPair } from "@/lib/types";
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

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const pair = await apiFetch<TokenPair>("/auth/login", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setSession(pair);
      pushToast(`Welcome back, ${pair.user.full_name || pair.user.email}!`, "success");
      router.push(pair.user.onboarding_completed ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError("");
    setDemoLoading(true);
    try {
      const pair = await apiFetch<TokenPair>("/auth/demo", { method: "POST", skipAuth: true });
      setSession(pair);
      pushToast("Signed into Demo workspace", "success");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login unavailable");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <section aria-labelledby="login-heading" className="mx-auto max-w-md py-6 sm:py-10">
      <Surface variant="elevated" radius="3xl" className="p-7 sm:p-8">
        <h1
          id="login-heading"
          className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Welcome back
        </h1>
        <p className="mt-2 text-sm leading-[1.55] text-ink-secondary">
          Sign in to access your job intelligence dashboard.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] px-3.5 py-2.5 text-xs leading-5 text-[rgb(var(--status-danger-fg))]"
          >
            <AlertCircleIcon />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-muted">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-muted">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field min-h-[48px] pr-20 sm:min-h-[42px]"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg px-2.5 text-xs font-medium text-ink-secondary transition-colors duration-150 hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-[36px]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            disabled={loading || demoLoading}
            className="w-full"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-hairline" />
          <span className="text-xs text-muted">or</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={demoLoading}
          disabled={loading || demoLoading}
          onClick={handleDemo}
          className="w-full"
        >
          {demoLoading ? "Starting Demo..." : "Continue with Demo Account"}
        </Button>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          New here?{" "}
          <Link
            href="/auth/register"
            className="inline-flex min-h-[44px] items-center rounded-md px-1 font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-0"
          >
            Create account
          </Link>
        </p>
      </Surface>
    </section>
  );
}
