/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark, low-chroma surfaces so status colours are the only saturated
        // thing on screen.
        base: '#0a0c10',
        panel: '#10141b',
        raised: '#161b24',
        hover: '#1b212c',
        line: '#232a36',
        'line-strong': '#2f3846',
        fg: '#e6e9f0',
        muted: '#98a2b3',
        faint: '#69748a',
        accent: '#4d8dff',
        'accent-dim': '#1e3a6b',
        ok: '#3fb950',
        warn: '#f0a92c',
        danger: '#f85149',
        violet: '#a371f7',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'SFMono-Regular',
          'ui-monospace',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        sweep: 'sweep 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
