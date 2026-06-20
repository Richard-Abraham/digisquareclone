/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: "#6366F1", 50: "#EEF2FF", 100: "#E0E7FF", 200: "#C7D2FE",
          300: "#A5B4FC", 400: "#818CF8", 500: "#6366F1", 600: "#4F46E5",
          700: "#4338CA", 800: "#3730A3", 900: "#312E81",
        },
        surface: {
          DEFAULT: "#F8FAFC", 1: "#FFFFFF", 2: "#F1F5F9", 3: "#E2E8F0",
          muted: "#F8FAFC", card: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E2E8F0", subtle: "#F1F5F9", accent: "#CBD5E1",
        },
        text: {
          primary: "#0F172A", secondary: "#475569", tertiary: "#94A3B8",
          placeholder: "#CBD5E1", inverse: "#FFFFFF",
        },
        status: {
          backlog: "#94A3B8", unstarted: "#6366F1", started: "#F59E0B",
          completed: "#10B981", cancelled: "#EF4444",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.06)",
        elevated: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)",
        modal: "0 20px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.10)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "slide-in-right": "slideInRight 0.2s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideInRight: { "0%": { opacity: "0", transform: "translateX(4px)" }, "100%": { opacity: "1", transform: "translateX(0)" } },
        pulseSoft: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.7" } },
      },
    },
  },
  plugins: [],
};
