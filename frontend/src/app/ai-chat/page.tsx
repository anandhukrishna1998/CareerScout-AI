import { Sidebar } from "@/components/sidebar";
import { AIChatPanel } from "@/components/ai-chat-panel";

export default function AIChatPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">AI Chat Assistant</h1>
        <AIChatPanel />
      </section>
    </div>
  );
}
