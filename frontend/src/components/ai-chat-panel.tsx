"use client";

import { useState } from "react";

export function AIChatPanel() {
  const [value, setValue] = useState("");
  return (
    <section className="glass rounded-xl p-4">
      <h2 className="mb-2 text-sm font-semibold">AI Career Assistant</h2>
      <div className="mb-3 h-48 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
        Ask for CV improvements, missing skills, or role strategy.
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/20 p-2 text-sm"
          placeholder="How can I improve my ATS score for ML Engineer roles?"
        />
        <button className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">Send</button>
      </div>
    </section>
  );
}
