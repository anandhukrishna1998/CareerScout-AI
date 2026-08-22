"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AIChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your AI Career Coach. How can I help you today?" }
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!value.trim() || loading) return;
    
    const userMsg = value.trim();
    setValue("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetchApi("/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I ran into an error communicating with the server." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <section className="mb-4 flex flex-col h-[500px] w-[350px] bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl p-4 overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
            <h2 className="text-base font-black uppercase">AI Career Assistant</h2>
            <button onClick={() => setIsOpen(false)} className="text-xl font-black">&times;</button>
          </div>
          
          <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 text-sm font-medium border-2 border-black ${msg.role === "user" ? "bg-brand text-black" : "bg-white text-black"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-gray-100 border-2 border-black p-3 text-sm font-medium text-black">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={loading}
              className="w-full rounded-md border-2 border-black bg-white p-2 text-sm font-medium disabled:opacity-50"
              placeholder="Ask me anything..."
            />
            <button 
              onClick={handleSend}
              disabled={loading || !value.trim()}
              className="rounded-md border-2 border-black bg-brand px-4 py-2 text-sm font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              Send
            </button>
          </div>
        </section>
      )}

      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-brand text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
        >
          💬
        </button>
      )}
    </div>
  );
}
