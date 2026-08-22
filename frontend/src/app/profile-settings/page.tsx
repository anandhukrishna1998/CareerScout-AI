"use client";

import { useEffect, useState, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { fetchApi } from "@/lib/api";

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pref, setPref] = useState({
    country: "",
    city: "",
    technologies: "",
    salary_expectation: 0,
    remote_only: false,
    visa_sponsorship_needed: false,
  });

  // CV Upload State
  const [cvLoading, setCvLoading] = useState(false);
  const [cvResult, setCvResult] = useState<any>(null);
  const [cvError, setCvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadPref() {
      try {
        const res = await fetchApi("/preferences");
        const data = await res.json();
        setPref({
          ...data,
          technologies: data.technologies ? data.technologies.join(", ") : "",
        });
      } catch (err) {
        console.error("Failed to load preferences", err);
      } finally {
        setLoading(false);
      }
    }
    loadPref();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await fetchApi("/preferences", {
        method: "PUT",
        body: JSON.stringify({
          ...pref,
          technologies: pref.technologies.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setMessage("Preferences saved successfully!");
    } catch (err) {
      setMessage("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCvLoading(true);
    setCvError("");
    setCvResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetchApi("/cvs/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setCvResult(data);
    } catch (err: any) {
      setCvError(err.message || "Upload failed");
    } finally {
      setCvLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full max-w-4xl space-y-6">
        <div className="border-b border-white/10 pb-4 mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Profile & CV</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* CV Manager Section */}
          <div className="glass rounded-xl p-6 h-fit">
            <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase mb-4 border-b border-white/10 pb-2">AI CV Analysis</h2>
            <p className="text-sm font-medium text-zinc-300 mb-4">Upload your CV to be parsed and scored by our AI Engine.</p>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleUpload}
              accept=".pdf,.docx,.txt"
            />
            <button 
              className="w-full rounded-md border border-brand/50 bg-brand/10 px-4 py-2 text-sm font-bold text-brand transition hover:bg-brand/20 hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.4)] disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={cvLoading}
            >
              {cvLoading ? "Parsing with AI..." : "Upload CV"}
            </button>
            
            {cvError && <div className="mt-4 text-sm font-medium text-red-400 bg-red-500/10 p-2 border border-red-500/50 rounded-md">{cvError}</div>}
            
            {cvResult && (
              <div className="mt-6 rounded-lg bg-black/50 p-4 border border-white/10">
                <h3 className="font-bold text-brand text-lg tracking-tight drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">Success!</h3>
                <p className="text-xs font-medium text-zinc-400 mb-4">{cvResult.filename}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Experience</h4>
                    <p className="font-medium text-white">{cvResult.parsed.years_experience} years</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Skills</h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cvResult.parsed.skills.slice(0, 5).map((s: string) => (
                        <span key={s} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-medium text-zinc-300">{s}</span>
                      ))}
                      {cvResult.parsed.skills.length > 5 && <span className="px-2 py-0.5 text-[10px] font-medium text-zinc-500">+{cvResult.parsed.skills.length - 5} more</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preferences Section */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase mb-4 border-b border-white/10 pb-2">Job Preferences</h2>
            {loading ? (
              <div className="text-zinc-500 font-medium">Loading preferences...</div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-500 uppercase mb-1">Country</label>
                    <input
                      value={pref.country}
                      onChange={(e) => setPref({ ...pref, country: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
                      placeholder="e.g. France"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-500 uppercase mb-1">City</label>
                    <input
                      value={pref.city}
                      onChange={(e) => setPref({ ...pref, city: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
                      placeholder="e.g. Paris"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-500 uppercase mb-1">Target Technologies</label>
                  <input
                    value={pref.technologies}
                    onChange={(e) => setPref({ ...pref, technologies: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
                    placeholder="Python, React, PostgreSQL"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-500 uppercase mb-1">Salary Expectation (Annual)</label>
                  <input
                    type="number"
                    value={pref.salary_expectation || ""}
                    onChange={(e) => setPref({ ...pref, salary_expectation: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-sm font-medium text-white focus:border-brand focus:outline-none transition-colors"
                    placeholder="e.g. 80000"
                  />
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                  <input
                    type="checkbox"
                    id="remote"
                    checked={pref.remote_only}
                    onChange={(e) => setPref({ ...pref, remote_only: e.target.checked })}
                    className="h-4 w-4 rounded border border-white/10 bg-black"
                  />
                  <label htmlFor="remote" className="text-sm font-medium text-white">Remote Only</label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="visa"
                    checked={pref.visa_sponsorship_needed}
                    onChange={(e) => setPref({ ...pref, visa_sponsorship_needed: e.target.checked })}
                    className="h-4 w-4 rounded border border-white/10 bg-black"
                  />
                  <label htmlFor="visa" className="text-sm font-medium text-white">I need Visa Sponsorship</label>
                </div>

                {message && <div className="text-sm font-medium text-brand bg-brand/10 border border-brand/50 p-2 rounded-md">{message}</div>}

                <button 
                  type="submit" 
                  disabled={saving}
                  className="mt-6 w-full rounded-md bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-zinc-200 hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Preferences"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
