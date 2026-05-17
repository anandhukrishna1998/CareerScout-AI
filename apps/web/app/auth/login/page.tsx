import Link from "next/link";

export default function LoginPage() {
  return (
    <section className="mx-auto mt-12 max-w-md rounded-2xl border border-white/10 bg-panel p-6">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-zinc-400">Sign in to access your job intelligence dashboard.</p>
      <form className="mt-6 space-y-3">
        <input className="w-full rounded-md border border-white/10 bg-black/20 p-2" placeholder="Email" />
        <input className="w-full rounded-md border border-white/10 bg-black/20 p-2" placeholder="Password" type="password" />
        <button className="w-full rounded-md bg-brand px-4 py-2 font-medium">Sign in</button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        New here?{" "}
        <Link className="text-violet-300" href="/auth/register">
          Create account
        </Link>
      </p>
    </section>
  );
}
