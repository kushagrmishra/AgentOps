/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#10141b',
        line: '#232a36',
        fg: '#ffffff',
        faint: '#cbd5e1',
        warn: '#f0a92c',
        // AgentOps palette + shadcn-compatible tokens for ui/*
        background: '#0a0c10',
        foreground: '#ffffff',
        card: {
          DEFAULT: '#10141b',
          foreground: '#ffffff',
        },
        primary: {
          DEFAULT: '#4d8dff',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#161b24',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#f85149',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#ffffff',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#4d8dff',
          foreground: '#ffffff',
        },
        border: '#232a36',
        input: '#232a36',
        ring: '#4d8dff',
      },
      backgroundColor: {
        base: '#0a0c10',
      },
      borderColor: {
        base: '#0a0c10',
      },
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        logo: ['Paris2024', 'Yukimari', 'sans-serif'],
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
