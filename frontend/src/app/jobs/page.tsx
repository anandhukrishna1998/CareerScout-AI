import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";
import { FilterPanel } from "@/components/filter-panel";

export default function JobExplorerPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="grid w-full gap-4 lg:grid-cols-[280px_1fr]">
        <FilterPanel />
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">Job Explorer</h1>
          <JobCard title="AI Engineer" company="Nova AI" location="Paris" score={92} remote="Hybrid" />
          <JobCard title="Backend Python Engineer" company="DataPulse" location="Nantes" score={85} remote="Remote" />
          <JobCard title="NLP Engineer" company="VisionStack" location="Remote" score={89} remote="Remote" />
        </div>
      </section>
    </div>
  );
}
