import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1621",
        paper: "#F3F5F7",
        surface: "#FFFFFF",
        line: "#D7DEE6",
        muted: "#5B6B7C",
        signal: "#0F8A7A",
        profit: "#1B8A4A",
        loss: "#C23B3B",
        warn: "#C47E1A",
      },
      fontFamily: {
        display: ['"Syne"', "sans-serif"],
        sans: ['"Source Sans 3"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(14, 22, 33, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
