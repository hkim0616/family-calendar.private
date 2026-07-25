import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Mirrors the CSS variables in app/globals.css so Tailwind utilities
      // like `text-muted` / `bg-surface` follow light & dark mode for free.
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        line: "var(--border)",
        body: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        danger: "var(--danger)",
        success: "var(--success)",
      },
    },
  },
  plugins: [],
};
export default config;
