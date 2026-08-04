import { Sidebar } from "@/components/sidebar";

export default function EmailSettingsPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Email Settings</h1>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-zinc-300">Subject: Top AI/Data jobs matching your profile today</p>
          <p className="mt-2 text-sm text-zinc-400">Cadence: Daily at 07:00 (local time)</p>
        </div>
      </section>
    </div>
  );
}
