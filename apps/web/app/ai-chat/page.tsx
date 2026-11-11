"use client";

import { AIChatPanel } from "@/components/ai-chat-panel";
import { AuthGate } from "@/components/auth-gate";

export default function AIChatPage() {
  return (
    <section
      aria-labelledby="ai-chat-heading"
      className="mx-auto w-full max-w-4xl min-w-0 space-y-6"
    >
      <div className="min-w-0">
        <h1
          id="ai-chat-heading"
          className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          AI Chat Assistant
        </h1>
        <p className="mt-1 max-w-[65ch] text-sm leading-[1.55] text-ink-secondary">
          Collaborate with your botanical career studio coach on CV refinements, skill gaps, and
          interview preparation.
        </p>
      </div>

      <AuthGate>
        <AIChatPanel />
      </AuthGate>
    </section>
  );
}
