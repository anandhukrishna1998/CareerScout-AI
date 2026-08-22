type MatchScoreCardProps = {
  score: number;
  strengths: string[];
  missing: string[];
};

export function MatchScoreCard({ score, strengths, missing }: MatchScoreCardProps) {
  return (
    <section className="glass rounded-xl p-5">
      <p className="text-sm font-medium tracking-wide text-zinc-400 uppercase">ATS Match Score</p>
      <p className="mt-1 text-4xl font-bold text-white"><span className="text-brand drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">{score}</span><span className="text-zinc-500 text-2xl">/100</span></p>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Strengths</p>
        <ul className="space-y-1 text-sm font-medium text-zinc-300">
          {strengths.map((s) => (
            <li key={s}>+ {s}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Missing skills</p>
        <ul className="space-y-1 text-sm font-medium text-zinc-300">
          {missing.map((m) => (
            <li key={m}>- {m}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
