/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#3f76ff", 50: "#eef3ff", 100: "#e0e9ff", 200: "#c7d6fe", 500: "#3f76ff", 600: "#2558e8", 700: "#1a44c9" },
        surface: { DEFAULT: "#f8f9fc", 1: "#ffffff", 2: "#f1f3f8", 3: "#e8ecf4" },
        border: { DEFAULT: "#e2e6ef", subtle: "#eef0f6" },
        text: { primary: "#1a1d23", secondary: "#5e6574", tertiary: "#9ca3af", placeholder: "#b0b7c3" },
        status: { backlog: "#a3a3a3", unstarted: "#3f76ff", started: "#f59e0b", completed: "#16a34a", cancelled: "#dc2626" },
      },
    },
  },
  plugins: [],
};
