/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 修仙世界色彩系统
        void: {
          DEFAULT: "#0a0e1a",
          50: "#111827",
          100: "#0f1424",
          200: "#0d1120",
          300: "#0a0e1a",
          400: "#080b15",
          500: "#050710",
        },
        qi: {
          DEFAULT: "#38bdf8",
          dim: "rgba(56, 189, 248, 0.15)",
          glow: "rgba(56, 189, 248, 0.5)",
        },
        gold: {
          DEFAULT: "#fbbf24",
          dim: "rgba(251, 191, 36, 0.12)",
          glow: "rgba(251, 191, 36, 0.4)",
        },
        vein: "#c084fc",
        danger: "#f43f5e",
        success: "#10b981",
        combat: "#f97316",
      },
      fontFamily: {
        title: ["Cinzel", "Noto Serif SC", "serif"],
        body: ["Noto Serif SC", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-qi": "pulseQi 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseQi: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
