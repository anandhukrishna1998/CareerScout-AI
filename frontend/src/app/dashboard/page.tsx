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
      <section className="w-full space-y-6">
        <div className="border-b border-white/10 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        </div>
        
        {loading ? (
          <div className="glass flex h-32 items-center justify-center">
            <span className="font-medium text-zinc-400">Analyzing your CV against latest jobs...</span>
          </div>
        ) : error ? (
          <div className="glass bg-red-500/10 border-red-500/50 p-5 text-red-400 font-medium">
            {error}
          </div>
        ) : matches.length === 0 ? (
          <div className="glass p-5 text-zinc-400 font-medium">
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
              <div className="glass p-5 lg:col-span-2">
                <p className="text-sm font-medium tracking-wide text-zinc-400 uppercase">Daily Highlights</p>
                <p className="mt-2 text-base font-medium text-zinc-300">
                  <strong className="text-white">{matches.length}</strong> new matches in the last 24h. Your top match is a <strong className="text-brand drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">{topMatch.score}%</strong> fit.
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
