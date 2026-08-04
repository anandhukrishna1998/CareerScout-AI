import { MatchScoreCard } from "@/components/match-score-card";

export default async function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Job Details #{id}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Senior AI Engineer</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Build LLM products, optimize inference, and own production-grade AI services.
          </p>
          <p className="mt-4 text-sm text-zinc-400">Salary: 70k-95k EUR · Remote: Hybrid · Contract: CDI</p>
        </div>
        <MatchScoreCard score={91} strengths={["Python", "MLOps", "FastAPI"]} missing={["Spark", "AWS"]} />
      </div>
    </section>
  );
}
