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
        faint: '#69748a',
        warn: '#f0a92c',
        // AgentOps palette + shadcn-compatible tokens for ui/*
        background: '#0a0c10',
        foreground: '#e6e9f0',
        primary: {
          DEFAULT: '#4d8dff',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#161b24',
          foreground: '#e6e9f0',
        },
        destructive: {
          DEFAULT: '#f85149',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#98a2b3',
          foreground: '#e6e9f0',
        },
        accent: {
          DEFAULT: '#4d8dff',
          foreground: '#ffffff',
        },
        border: '#232a36',
        input: '#232a36',
        ring: '#4d8dff',
      },
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
};
