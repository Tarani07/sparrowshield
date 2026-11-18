import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        healthy: "#22c55e",
        warning: "#f59e0b",
        critical: "#ef4444",
        accent: "#6366f1",
      },
      // Tighter corners than the default "soft" look: enterprise consoles use 4–8px.
      borderRadius: {
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.625rem",
        "3xl": "0.75rem",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
