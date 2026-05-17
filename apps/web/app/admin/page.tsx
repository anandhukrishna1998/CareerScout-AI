import { Sidebar } from "@/components/sidebar";

export default function AdminDashboardPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="glass rounded-xl p-5 text-sm text-zinc-300">
          Scraper health, queue depth, provider statuses, and ingestion failures.
        </div>
      </section>
    </div>
  );
}
