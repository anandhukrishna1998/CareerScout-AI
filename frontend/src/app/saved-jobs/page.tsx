"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";
import { fetchApi } from "@/lib/api";

export default function SavedJobsPage() {
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSavedJobs() {
      try {
        const res = await fetchApi("/saved-jobs");
        const data = await res.json();
        setSavedJobs(data || []);
      } catch (error) {
        console.error("Failed to load saved jobs", error);
      } finally {
        setLoading(false);
      }
    }
    loadSavedJobs();
  }, []);

  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <div className="border-b border-white/10 pb-4 mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">Saved Jobs</h1>
        </div>
        
        {loading ? (
          <div className="text-zinc-400 font-medium">Loading saved jobs...</div>
        ) : savedJobs.length === 0 ? (
          <div className="text-zinc-400 font-medium">You haven't saved any jobs yet.</div>
        ) : (
          savedJobs.map((job) => (
            <div key={job.id} className="cursor-pointer" onClick={() => window.open(job.apply_url, "_blank")}>
              <JobCard 
                job_id={job.job_id}
                title={job.title} 
                company={job.company} 
                location={job.location} 
                remote={job.location.toLowerCase().includes('remote') ? 'Remote' : 'On-site'} 
                saved={true}
              />
            </div>
          ))
        )}
      </section>
    </div>
  );
}
