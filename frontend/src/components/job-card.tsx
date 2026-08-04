type JobCardProps = {
  title: string;
  company: string;
  location: string;
  score: number;
  remote: string;
};

export function JobCard({ title, company, location, score, remote }: JobCardProps) {
  return (
    <article className="glass rounded-xl p-5 transition hover:border-brand/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="rounded-full bg-brand/30 px-2 py-1 text-xs font-medium text-violet-200">
          {score}/100
        </span>
      </div>
      <p className="text-sm text-zinc-300">{company}</p>
      <p className="text-sm text-zinc-400">
        {location} · {remote}
      </p>
    </article>
  );
}
