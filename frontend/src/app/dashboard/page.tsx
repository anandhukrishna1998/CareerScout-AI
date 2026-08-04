import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";
import { MatchScoreCard } from "@/components/match-score-card";

export default function DashboardPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-5">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="grid gap-4 lg:grid-cols-3">
          <MatchScoreCard
            score={91}
            strengths={["Strong Python experience", "LLM engineering background"]}
            missing={["Spark", "AWS"]}
          />
          <div className="glass rounded-xl p-5 lg:col-span-2">
            <p className="text-sm text-zinc-300">Daily highlights</p>
            <p className="mt-2 text-zinc-400">8 new matches in the last 24h. 3 high-priority roles.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <JobCard title="Senior Data Engineer" company="TechScale" location="Paris" score={90} remote="Hybrid" />
          <JobCard title="ML Engineer" company="Quant Labs" location="Lyon" score={88} remote="Remote" />
        </div>
      </section>
    </div>
  );
}
