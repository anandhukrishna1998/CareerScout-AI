export function FilterPanel() {
  return (
    <section className="glass rounded-xl p-4">
      <h2 className="text-sm font-semibold">Advanced Filters</h2>
      <div className="mt-3 grid gap-2 text-sm text-zinc-300">
        <label>Country</label>
        <input className="rounded-md border border-white/10 bg-black/20 p-2" placeholder="France" />
        <label>City</label>
        <input className="rounded-md border border-white/10 bg-black/20 p-2" placeholder="Paris" />
        <label>Technologies</label>
        <input className="rounded-md border border-white/10 bg-black/20 p-2" placeholder="Python, LLM, FastAPI" />
      </div>
    </section>
  );
}
