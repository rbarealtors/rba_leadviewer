import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1d23",
        subtle: "#6b7280",
        line: "#e5e7eb",
        panel: "#ffffff",
        canvas: "#f7f8fa",
        accent: "#1f4b3f",
        "accent-soft": "#e9f1ee",
        new: "#b45309",
        "new-soft": "#fef3e2",
      },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
      },
    },
  },
  plugins: [],
};

export default config;
