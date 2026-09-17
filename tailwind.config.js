/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./ui/index.html",
    "./ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        warp: {
          bg: '#000000',
          surface: '#09090b',
          card: '#121215',
          border: '#27272a',
          borderLight: '#3f3f46',
          cyan: '#f4f4f5',
          green: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
          purple: '#e4e4e7',
        }
      },
      fontFamily: {
        mono: ['Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
