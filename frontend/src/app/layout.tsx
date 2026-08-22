import "./globals.css";
import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { AIChatPanel } from "@/components/ai-chat-panel";

export const metadata: Metadata = {
  title: "CareerScout AI",
  description: "AI-powered job intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">{children}</main>
        <AIChatPanel />
      </body>
    </html>
  );
}
