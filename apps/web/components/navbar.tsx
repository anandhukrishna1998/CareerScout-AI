"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { TokenPair } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";
import { useTheme, useToast } from "./providers";
import { Button } from "./ui/button";

export const PRIMARY_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Roles" },
  { href: "/saved-jobs", label: "Saved" },
  { href: "/cvs", label: "CVs" },
  { href: "/ai-insights", label: "Insights" },
  { href: "/ai-chat", label: "AI Coach" },
] as const;

export const SECONDARY_LINKS = [
  { href: "/analytics", label: "Analytics" },
  { href: "/email-settings", label: "Email Digest" },
  { href: "/profile-settings", label: "Profile Settings" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/admin", label: "Admin" },
] as const;

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--accent)/0.22)] bg-accent-soft text-accent"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3C8.5 6.5 6.5 10.2 6.5 13.7a5.5 5.5 0 0 0 11 0C17.5 10.2 15.5 6.5 12 3Z" />
        <path d="M12 8.5V21" />
        <path d="M12 13.5 9.2 11.4" />
        <path d="M12 16.2 14.8 14.1" />
      </svg>
    </span>
  );
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  if (theme === "dark") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4 text-ink"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 text-ink"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MenuToggleIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { pushToast } = useToast();
  const { user, refreshToken, setSession, clearSession } = useAuthStore();

  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const moreContainerRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  const needsOnboarding = Boolean(user && !user.onboarding_completed);
  const hasActiveSecondary = SECONDARY_LINKS.some((link) => isActiveRoute(pathname, link.href));

  useEffect(() => {
    setMoreOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (moreContainerRef.current && !moreContainerRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const pair = await apiFetch<TokenPair>("/auth/demo", { method: "POST", skipAuth: true });
      setSession(pair);
      pushToast("Signed into Demo workspace", "success");
      setMoreOpen(false);
      setMobileOpen(false);
      router.push("/dashboard");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Demo sign-in failed", "error");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await apiFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
          skipAuth: true,
        });
      }
    } catch {
      // ignore logout transport errors
    } finally {
      clearSession();
      setMoreOpen(false);
      setMobileOpen(false);
      pushToast("Signed out", "info");
      router.push("/");
    }
  };

  const themeToggleLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <header
      ref={headerRef}
      className="sticky top-3 z-50 mx-auto w-full max-w-7xl px-4 sm:top-4 md:px-6"
    >
      <div className="flex items-center justify-between gap-2 rounded-full border border-hairline bg-surface/90 px-3 py-2 shadow-botanical backdrop-blur-md">
        <Link
          href="/"
          aria-label="CareerScout home"
          className="flex shrink-0 items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-1 text-ink transition duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <BrandMark />
          <span className="font-display text-base font-semibold tracking-[-0.02em] text-ink md:hidden lg:inline">
            CareerScout
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 rounded-full border border-hairline bg-subtle/75 p-1 md:flex lg:gap-1"
        >
          {PRIMARY_LINKS.map((link) => {
            const active = isActiveRoute(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:px-3 lg:text-sm ${
                  active
                    ? "bg-accent-soft font-medium text-accent-soft-ink"
                    : "text-ink-secondary hover:bg-hover/70 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          <div ref={moreContainerRef} className="relative">
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={moreOpen}
              aria-controls="navbar-more-menu"
              onClick={() => setMoreOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:px-3 lg:text-sm ${
                hasActiveSecondary || moreOpen
                  ? "bg-accent-soft font-medium text-accent-soft-ink"
                  : "text-ink-secondary hover:bg-hover/70 hover:text-ink"
              }`}
            >
              <span>More</span>
              {needsOnboarding && (
                <>
                  <span
                    aria-hidden="true"
                    title="Complete onboarding setup"
                    className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--status-warning-fg))]"
                  />
                  <span className="sr-only">Onboarding incomplete</span>
                </>
              )}
              <ChevronDownIcon open={moreOpen} />
            </button>

            {moreOpen && (
              <div
                id="navbar-more-menu"
                aria-label="More workspace routes"
                className="absolute right-0 top-[calc(100%+0.625rem)] z-50 w-60 rounded-2xl border border-hairline bg-surface p-2 shadow-botanical"
              >
                <div className="space-y-0.5">
                  {SECONDARY_LINKS.map((link) => {
                    const active = isActiveRoute(pathname, link.href);
                    const showSetupDot = link.href === "/onboarding" && needsOnboarding;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMoreOpen(false)}
                        className={`flex min-h-[40px] items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? "bg-accent-soft font-medium text-accent-soft-ink"
                            : "text-ink-secondary hover:bg-subtle hover:text-ink"
                        }`}
                      >
                        <span>{link.label}</span>
                        {showSetupDot && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--status-warning-bg))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--status-warning-fg))]">
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--status-warning-fg))]"
                            />
                            Setup
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex lg:gap-2">
          <button
            type="button"
            data-testid="theme-toggle"
            onClick={toggleTheme}
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            className="inline-flex h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-hairline bg-subtle text-ink transition duration-150 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ThemeIcon theme={theme} />
          </button>

          {user ? (
            <>
              <Link
                href="/profile-settings"
                title={
                  needsOnboarding ? "Profile Settings — complete onboarding" : "Profile Settings"
                }
                className="flex min-h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-hairline bg-subtle/80 px-3 py-1.5 text-xs font-medium text-ink transition duration-150 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    needsOnboarding ? "bg-[rgb(var(--status-warning-fg))]" : "bg-accent"
                  }`}
                />
                <span className="max-w-[90px] truncate lg:max-w-[140px]">
                  {user.full_name || user.email}
                </span>
              </Link>
              <Button variant="secondary" size="sm" onClick={handleLogout} className="shrink-0">
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={demoLoading}
                onClick={handleDemoLogin}
                className="shrink-0"
              >
                {demoLoading ? "Starting..." : "Try Demo"}
              </Button>
              <Link
                href="/auth/login"
                className="inline-flex min-h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition duration-150 hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:px-3"
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex min-h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-ink transition duration-150 hover:-translate-y-[1px] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:px-4"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            data-testid="theme-toggle-mobile"
            onClick={toggleTheme}
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-hairline bg-subtle text-ink transition duration-150 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ThemeIcon theme={theme} />
          </button>
          <button
            ref={mobileButtonRef}
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-hairline bg-subtle text-ink transition duration-150 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <MenuToggleIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-label="Navigation menu"
          className="mt-2 rounded-3xl border border-hairline bg-surface p-4 shadow-botanical md:hidden"
        >
          <nav aria-label="Mobile workspace navigation" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_LINKS.map((link) => {
                const active = isActiveRoute(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex min-h-[44px] items-center rounded-2xl px-3.5 py-2.5 text-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active
                        ? "bg-accent-soft font-medium text-accent-soft-ink"
                        : "bg-subtle/75 text-ink-secondary hover:bg-hover hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <div className="border-t border-hairline pt-3">
              <p className="mb-2 px-1 text-xs font-medium text-muted">Workspace &amp; Tools</p>
              <div className="grid grid-cols-2 gap-2">
                {SECONDARY_LINKS.map((link) => {
                  const active = isActiveRoute(pathname, link.href);
                  const showSetupDot = link.href === "/onboarding" && needsOnboarding;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`flex min-h-[44px] items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active
                          ? "bg-accent-soft font-medium text-accent-soft-ink"
                          : "bg-subtle/75 text-ink-secondary hover:bg-hover hover:text-ink"
                      }`}
                    >
                      <span className="truncate">{link.label}</span>
                      {showSetupDot && (
                        <span
                          aria-label="Onboarding incomplete"
                          className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--status-warning-fg))]"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="mt-4 flex flex-col gap-2.5 border-t border-hairline pt-4">
            {user ? (
              <>
                <Link
                  href="/profile-settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border border-hairline bg-subtle/60 px-3.5 py-2 text-xs text-ink-secondary transition hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="truncate">Signed in as {user.full_name || user.email}</span>
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      needsOnboarding ? "bg-[rgb(var(--status-warning-fg))]" : "bg-accent"
                    }`}
                  />
                </Link>
                <Button variant="secondary" size="sm" onClick={handleLogout} className="w-full">
                  Sign out
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={demoLoading}
                  onClick={handleDemoLogin}
                  className="col-span-2 w-full"
                >
                  {demoLoading ? "Starting..." : "Try Demo"}
                </Button>
                <Link
                  href="/auth/login"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-hairline bg-subtle px-4 py-2 text-xs font-medium text-ink transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
