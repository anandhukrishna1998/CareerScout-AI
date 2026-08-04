import { Sidebar } from "@/components/sidebar";

export default function AnalyticsDashboardPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>
        <div className="glass rounded-xl p-5 text-sm text-zinc-300">
          User engagement, match quality trends, and email conversion metrics.
        </div>
      </section>
    </div>
  );
}
