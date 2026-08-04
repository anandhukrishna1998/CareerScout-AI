type MatchScoreCardProps = {
  score: number;
  strengths: string[];
  missing: string[];
};

export function MatchScoreCard({ score, strengths, missing }: MatchScoreCardProps) {
  return (
    <section className="glass rounded-xl p-5">
      <p className="text-sm text-zinc-300">ATS Match Score</p>
      <p className="mt-1 text-3xl font-semibold">{score}/100</p>
      <div className="mt-4">
        <p className="mb-2 text-xs uppercase text-zinc-400">Strengths</p>
        <ul className="space-y-1 text-sm text-zinc-200">
          {strengths.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs uppercase text-zinc-400">Missing skills</p>
        <ul className="space-y-1 text-sm text-zinc-300">
          {missing.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
