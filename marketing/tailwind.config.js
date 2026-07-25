/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0c10',
        panel: '#10141b',
        line: '#232a36',
        fg: '#e6e9f0',
        muted: '#98a2b3',
        faint: '#69748a',
        accent: '#4d8dff',
        warn: '#f0a92c',
      },
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
