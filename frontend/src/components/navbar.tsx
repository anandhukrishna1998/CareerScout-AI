"use client";

import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/saved-jobs", label: "Saved" },
  { href: "/profile-settings", label: "Profile" },
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 glass rounded-none border-t-0 border-x-0 border-b border-white/10 bg-bg/80 px-6 py-4">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span className="text-brand">✦</span> CareerScout AI
        </Link>
        <nav className="hidden gap-6 text-sm font-medium text-zinc-300 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-white hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
