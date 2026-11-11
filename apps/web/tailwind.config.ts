import type { Config } from "tailwindcss";

const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        canvas: withAlpha("--bg-canvas"),
        surface: withAlpha("--bg-surface"),
        subtle: withAlpha("--bg-subtle"),
        hover: withAlpha("--bg-hover"),
        hairline: withAlpha("--border-hairline"),
        input: withAlpha("--border-input"),
        ink: {
          DEFAULT: withAlpha("--text-primary"),
          secondary: withAlpha("--text-secondary"),
        },
        muted: withAlpha("--text-muted"),
        placeholder: withAlpha("--text-placeholder"),
        accent: {
          DEFAULT: withAlpha("--accent"),
          hover: withAlpha("--accent-hover"),
          ink: withAlpha("--accent-ink"),
          text: withAlpha("--accent-text"),
          soft: withAlpha("--accent-soft"),
          "soft-ink": withAlpha("--accent-soft-ink"),
        },
        status: {
          "success-fg": withAlpha("--status-success-fg"),
          "success-bg": withAlpha("--status-success-bg"),
          "success-border": withAlpha("--status-success-border"),
          "warning-fg": withAlpha("--status-warning-fg"),
          "warning-bg": withAlpha("--status-warning-bg"),
          "warning-border": withAlpha("--status-warning-border"),
          "danger-fg": withAlpha("--status-danger-fg"),
          "danger-bg": withAlpha("--status-danger-bg"),
          "danger-border": withAlpha("--status-danger-border"),
        },
      },
      boxShadow: {
        botanical: "var(--shadow-botanical)",
      },
    },
  },
  plugins: [],
};

export default config;
