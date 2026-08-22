"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api";

type JobCardProps = {
  job_id?: number;
  title: string;
  company: string;
  location: string;
  score?: number;
  remote: string;
  contract_type?: string;
  saved?: boolean;
};

export function JobCard({ job_id, title, company, location, score, remote, contract_type = "Unknown", saved = false }: JobCardProps) {
  const [isSaved, setIsSaved] = useState(saved);
  const [loading, setLoading] = useState(false);

  const toggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!job_id || loading) return;

    setLoading(true);
    try {
      if (isSaved) {
        await fetchApi(`/saved-jobs/${job_id}`, { method: "DELETE" });
        setIsSaved(false);
      } else {
        await fetchApi(`/saved-jobs/${job_id}`, { method: "POST" });
        setIsSaved(true);
      }
    } catch (error) {
      console.error("Failed to toggle save", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="glass glass-glow relative rounded-xl p-5 transition-all group">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight text-white pr-8">{title}</h3>
        {score !== undefined && (
          <span className="rounded-full bg-brand/10 border border-brand/30 px-3 py-1 text-xs font-semibold text-brand drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
            {score}/100
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-zinc-300">{company}</p>
      <p className="text-sm text-zinc-400 mt-1">
        {location} · {remote} · {contract_type !== "Unknown" ? contract_type : "Contract Unknown"}
      </p>

      {job_id && (
        <button
          onClick={toggleSave}
          disabled={loading}
          className="absolute right-4 top-4 p-2 text-zinc-500 transition hover:text-brand hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] opacity-0 group-hover:opacity-100 disabled:opacity-50"
          title={isSaved ? "Unsave job" : "Save job"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={isSaved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isSaved ? "text-brand" : ""}
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </button>
      )}
    </article>
  );
}
