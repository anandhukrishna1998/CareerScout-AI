import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#09090b",
        panel: "#111113",
        muted: "#a1a1aa",
        brand: "#7c3aed",
      },
    },
  },
  plugins: [],
};

export default config;
