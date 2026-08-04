"use client";

import { useState, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { fetchApi } from "@/lib/api";

export default function CVManagerPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetchApi("/cvs/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">CV Manager</h1>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-zinc-300">Upload your CV to be parsed by our AI.</p>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleUpload}
            accept=".pdf,.docx,.txt"
          />
          <button 
            className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            {loading ? "Parsing with AI..." : "Upload CV"}
          </button>
          
          {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
          
          {result && (
            <div className="mt-6 rounded-lg bg-black/30 p-4 border border-white/5">
              <h3 className="font-semibold text-brand">Success! CV Parsed</h3>
              <p className="text-xs text-zinc-400 mb-4">{result.filename}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm text-zinc-400">Years Experience</h4>
                  <p className="font-medium">{result.parsed.years_experience} years</p>
                </div>
                <div>
                  <h4 className="text-sm text-zinc-400">Skills</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.parsed.skills.map((s: string) => (
                      <span key={s} className="px-2 py-0.5 bg-white/10 rounded-full text-xs">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <h4 className="text-sm text-zinc-400">Languages</h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.parsed.languages.map((l: string) => (
                      <span key={l} className="px-2 py-0.5 bg-white/10 rounded-full text-xs">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
