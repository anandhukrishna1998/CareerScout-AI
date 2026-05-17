import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="grid gap-8 py-14 md:grid-cols-2">
      <section>
        <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">
          AI-native job intelligence SaaS
        </p>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Discover the best AI/Data jobs matched to your profile daily.
        </h1>
        <p className="mt-4 max-w-xl text-zinc-300">
          CareerScout continuously scrapes fresh jobs, scores ATS fit against your CV, and sends premium daily reports with explainable matches.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/auth/login" className="rounded-lg bg-brand px-4 py-2 font-medium">
            Get Started
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-white/20 px-4 py-2">
            View Demo Dashboard
          </Link>
        </div>
      </section>
      <section className="glass rounded-2xl p-6">
        <p className="text-sm text-zinc-300">Today’s top match</p>
        <h2 className="mt-2 text-2xl font-semibold">Senior AI Engineer · Paris · Remote Hybrid</h2>
        <p className="mt-3 text-sm text-zinc-400">
          ATS score 91/100. Strong Python + LLM engineering fit. Missing: Spark, AWS.
        </p>
      </section>
    </div>
  );
}
