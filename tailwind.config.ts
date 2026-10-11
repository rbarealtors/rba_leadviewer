import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212F",
        subtle: "#566273",
        line: "#D5DCE5",
        panel: "#ffffff",
        canvas: "#F3F5F8",
        accent: "#1f4b3f",
        "accent-soft": "#e9f1ee",
        new: "#b45309",
        "new-soft": "#fef3e2",
        "header-bg": "#174B3A",
      },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-4px)" },
          "40%, 80%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
