export default function OnboardingPage() {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-panel p-6">
      <h1 className="text-2xl font-semibold">Onboarding Wizard</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Country, preferred countries, experience, roles, technologies, languages, salary, visa, remote mode, CV upload.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[
          "Country",
          "Preferred Countries",
          "Experience Level",
          "Preferred Roles",
          "Technologies",
          "Languages",
          "Salary Expectation",
          "Visa Sponsorship",
          "Remote Preference",
          "Upload CV(s)",
        ].map((item) => (
          <div key={item} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
