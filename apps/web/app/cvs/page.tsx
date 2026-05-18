import { Sidebar } from "@/components/sidebar";

export default function CVManagerPage() {
  return (
    <div className="flex gap-6">
      <Sidebar />
      <section className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">CV Manager</h1>
        <div className="glass rounded-xl p-5">
          <p className="text-sm text-zinc-300">Upload one or multiple CVs (PDF, DOCX).</p>
          <button className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium">Upload CV</button>
        </div>
      </section>
    </div>
  );
}
