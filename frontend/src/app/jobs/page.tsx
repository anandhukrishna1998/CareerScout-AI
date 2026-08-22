"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";
import { FilterPanel } from "@/components/filter-panel";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { fetchApi } from "@/lib/api";

export default function JobExplorerPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters State
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState("All");
  const [postingAgeHours, setPostingAgeHours] = useState(24);

  // Manual Scrape State
  const [scrapeKeyword, setScrapeKeyword] = useState("");
  const [scrapeLocation, setScrapeLocation] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (location) queryParams.append("location", location);
        if (contractType && contractType !== "All") queryParams.append("contract_type", contractType);
        queryParams.append("posting_age_hours", postingAgeHours.toString());
        
        const res = await fetchApi(`/jobs?${queryParams.toString()}`);
        const data = await res.json();
        setJobs(data.items || []);
      } catch (error) {
        console.error("Failed to load jobs", error);
      } finally {
        setLoading(false);
      }
    }
    
    // Debounce the fetch slightly for typing in the location box
    const timeout = setTimeout(() => {
      loadJobs();
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [location, contractType, postingAgeHours, refreshTrigger]);

  const handleManualScrape = async () => {
    if (!scrapeKeyword || !scrapeLocation) return;
    setIsScraping(true);
    try {
      await fetchApi("/jobs/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: scrapeKeyword, location: scrapeLocation }),
      });
      // The API returns immediately and scrapes in background.
      // Wait a few seconds for scraping to finish, then trigger a refresh
      setTimeout(() => {
        setRefreshTrigger(prev => prev + 1);
        setIsScraping(false);
      }, 8000);
    } catch (error) {
      console.error("Failed to trigger scrape", error);
      setIsScraping(false);
    }
  };

  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="grid w-full gap-4 lg:grid-cols-[280px_1fr]">
        <FilterPanel 
          location={location} 
          setLocation={setLocation} 
          contractType={contractType} 
          setContractType={setContractType} 
          postingAgeHours={postingAgeHours}
          setPostingAgeHours={setPostingAgeHours}
        />
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-bold tracking-tight text-white">Job Explorer</h1>
            
            {/* On-Demand Scraper */}
            <div className="flex gap-2 items-center glass p-2 rounded-lg">
              <span className="text-sm font-medium text-zinc-300 mr-2">Live Search:</span>
              <AutocompleteInput 
                type="keyword"
                value={scrapeKeyword}
                onChange={setScrapeKeyword}
                placeholder="Keyword (e.g. React)" 
                className="w-40 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
              />
              <AutocompleteInput 
                type="location"
                value={scrapeLocation}
                onChange={setScrapeLocation}
                placeholder="Location (e.g. London)" 
                className="w-40 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
              />
              <button 
                onClick={handleManualScrape}
                disabled={isScraping || !scrapeKeyword || !scrapeLocation}
                className="bg-brand text-black px-3 py-1.5 rounded-md text-sm font-bold transition hover:bg-brand/80 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)] hover:drop-shadow-[0_0_12px_rgba(0,240,255,0.8)] disabled:opacity-50 disabled:hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]"
              >
                {isScraping ? "Scraping..." : "Search & Add"}
              </button>
            </div>
          </div>
          
          {loading ? (
            <div className="text-zinc-400 font-medium">Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="text-zinc-400 font-medium">No jobs found matching your criteria.</div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="cursor-pointer" onClick={() => window.open(job.apply_url, "_blank")}>
                <JobCard 
                  job_id={job.id}
                  title={job.title} 
                  company={job.company} 
                  location={job.city || job.country || job.location} 
                  remote={job.remote_mode} 
                  contract_type={job.contract_type}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
