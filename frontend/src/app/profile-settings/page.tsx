import { Sidebar } from "@/components/sidebar";

export default function ProfileSettingsPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Profile Settings</h1>
        <div className="glass rounded-xl p-5 text-sm text-zinc-300">
          Manage country, cities, technologies, languages, salary expectations, and visa preferences.
        </div>
      </section>
    </div>
  );
}
