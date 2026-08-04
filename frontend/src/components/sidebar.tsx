import Link from "next/link";

const nav = [
  ["Overview", "/dashboard"],
  ["Job Explorer", "/jobs"],
  ["Saved Jobs", "/saved-jobs"],
  ["CV Manager", "/cvs"],
  ["AI Insights", "/ai-insights"],
  ["Email Settings", "/email-settings"],
  ["Profile", "/profile-settings"],
  ["Analytics", "/analytics"],
  ["Admin", "/admin"],
];

export function Sidebar() {
  return (
    <aside className="glass hidden h-[calc(100vh-7rem)] w-64 shrink-0 rounded-xl p-4 md:block">
      <p className="mb-4 text-xs uppercase tracking-wider text-zinc-400">Workspace</p>
      <div className="space-y-1">
        {nav.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="block rounded-md px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            {label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
