type FilterPanelProps = {
  location: string;
  setLocation: (val: string) => void;
  contractType: string;
  setContractType: (val: string) => void;
  postingAgeHours: number;
  setPostingAgeHours: (val: number) => void;
};

export function FilterPanel({ location, setLocation, contractType, setContractType, postingAgeHours, setPostingAgeHours }: FilterPanelProps) {
  return (
    <section className="glass rounded-xl p-5 h-fit">
      <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase mb-4">Advanced Filters</h2>
      <div className="grid gap-4 text-sm font-medium text-white">
        <div>
          <label className="block mb-1 text-zinc-400">Date Posted</label>
          <select 
            value={postingAgeHours}
            onChange={(e) => setPostingAgeHours(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-white focus:border-brand focus:outline-none transition-colors"
          >
            <option value={24}>Last 24 Hours</option>
            <option value={72}>Last 3 Days</option>
            <option value={168}>Last 1 Week</option>
            <option value={720}>Last 1 Month</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-zinc-400">Location</label>
          <input 
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-white focus:border-brand focus:outline-none transition-colors" 
            placeholder="e.g. Paris or Remote" 
          />
        </div>
        <div>
          <label className="block mb-1 text-zinc-400">Contract Type</label>
          <select 
            value={contractType}
            onChange={(e) => setContractType(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-white focus:border-brand focus:outline-none transition-colors"
          >
            <option value="All">All Types</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Stage/Internship">Stage / Internship</option>
            <option value="Alternance">Alternance</option>
          </select>
        </div>
      </div>
    </section>
  );
}
