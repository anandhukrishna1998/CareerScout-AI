import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CareerScout AI — Daily Job Intelligence & ATS Matching",
  description:
    "AI-powered job scraping, ATS resume scoring, skill gap analytics, and daily match digests.",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('careerscout-theme');var m=(t==='light'||t==='dark')?t:'light';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(m);r.style.colorScheme=m;}catch(e){var r=document.documentElement;r.classList.remove('light','dark');r.classList.add('light');r.style.colorScheme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`light ${outfit.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] bg-canvas font-sans text-ink antialiased selection:bg-accent-soft selection:text-accent-soft-ink">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink focus:shadow-botanical"
        >
          Skip to main content
        </a>
        <Providers>
          <Navbar />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none md:px-6"
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
