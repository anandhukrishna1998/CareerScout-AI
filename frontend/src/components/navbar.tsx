"use client";

import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/cvs", label: "CVs" },
  { href: "/ai-insights", label: "AI Insights" },
  { href: "/ai-chat", label: "AI Chat" },
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-bg/80 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CareerScout AI
        </Link>
        <nav className="hidden gap-5 text-sm text-zinc-300 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
