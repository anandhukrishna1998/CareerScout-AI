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

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const { pushToast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const pair = await apiFetch<TokenPair>("/auth/register", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      setSession(pair);
      pushToast("Account created! Let's personalize your profile.", "success");
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="register-heading" className="mx-auto max-w-md py-6 sm:py-10">
      <Surface variant="elevated" radius="3xl" className="p-7 sm:p-8">
        <h1
          id="register-heading"
          className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-[1.55] text-ink-secondary">
          Start receiving personalized AI/Data job matches every day.
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
            <label
              htmlFor="register-full-name"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Full name
            </label>
            <input
              id="register-full-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Alex Moreau"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-xs font-medium text-muted">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="alex@company.com"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Password (min 8 chars)
            </label>
            <div className="relative">
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field min-h-[48px] pr-20 sm:min-h-[42px]"
                placeholder="At least 8 characters"
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

          <Button type="submit" variant="primary" size="md" loading={loading} className="w-full">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="inline-flex min-h-[44px] items-center rounded-md px-1 font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-0"
          >
            Sign in
          </Link>
        </p>
      </Surface>
    </section>
  );
}
