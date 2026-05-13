/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'status-operational': '#22c55e',
        'status-degraded': '#eab308',
        'status-partial': '#f97316',
        'status-major': '#ef4444',
      }
    },
  },
  plugins: [],
}
