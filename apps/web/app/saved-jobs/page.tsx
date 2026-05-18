import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";

export default function SavedJobsPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Saved Jobs</h1>
        <JobCard title="Applied AI Engineer" company="Orbit Data" location="Paris" score={87} remote="Hybrid" />
      </section>
    </div>
  );
}
