import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        panel: "#111111",
        muted: "#a1a1aa",
        brand: "#00f0ff", // Neon Cyan
      },
    },
  },
  plugins: [],
};

export default config;
