"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { JobCard } from "@/components/job-card";
import { MatchScoreCard } from "@/components/match-score-card";
import { fetchApi } from "@/lib/api";

export default function DashboardPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMatches() {
      try {
        const res = await fetchApi("/matches/daily");
        const data = await res.json();
        setMatches(data);
      } catch (err: any) {
        setError(err.message || "Failed to load matches");
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, []);

  const topMatch = matches.length > 0 ? matches[0] : null;

  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-5">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        
        {loading ? (
          <div className="flex h-32 items-center justify-center rounded-xl bg-panel">
            <span className="text-zinc-400">Analyzing your CV against latest jobs...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-400">
            {error}
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl bg-panel p-5 text-zinc-400">
            No matches found yet. Have you uploaded your CV?
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <MatchScoreCard
                score={topMatch.score}
                strengths={topMatch.strengths}
                missing={topMatch.missing_skills}
              />
              <div className="glass rounded-xl p-5 lg:col-span-2">
                <p className="text-sm text-zinc-300">Daily highlights</p>
                <p className="mt-2 text-zinc-400">
                  {matches.length} new matches in the last 24h. Your top match is a {topMatch.score}% fit.
                </p>
              </div>
            </div>
            
            <div className="grid gap-3 md:grid-cols-2">
              {matches.map((match) => (
                <div key={match.job_id} className="cursor-pointer" onClick={() => {
                  if (match.apply_url) window.open(match.apply_url, "_blank");
                }}>
                  <JobCard 
                    title={match.title} 
                    company={match.company} 
                    location={match.location} 
                    score={match.score} 
                    remote={match.location.toLowerCase().includes('remote') ? 'Remote' : 'On-site'} 
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
