import { Sidebar } from "@/components/sidebar";

export default function AIInsightsPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">AI Insights</h1>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-zinc-300">Missing skills: Spark, AWS, Terraform.</p>
          <p className="mt-2 text-sm text-zinc-400">Recommendation: Add cloud deployment projects to improve ATS alignment.</p>
        </div>
      </section>
    </div>
  );
}
