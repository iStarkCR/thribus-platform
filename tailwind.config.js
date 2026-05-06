/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: {
          0: '#090e09',
          1: '#0d140d',
          2: '#121c12',
          3: '#172117',
          4: '#1e2b1e',
          hover: '#1a261a',
        },
        brand: {
          dim: '#4a7a3d',
          DEFAULT: '#6B8F5E',
          bright: '#8cc47a',
          glow: '#a8d496',
        },
        creme: {
          DEFAULT: '#EDE8DC',
          dim: '#c4bfb2',
          mute: '#8a857a',
          faint: '#5e5a52',
        },
        semantic: {
          green: '#4ade80',
          amber: '#fbbf24',
          red: '#f87171',
          blue: '#60a5fa',
        },
      },
      borderColor: {
        default: 'rgba(107,143,94,0.12)',
        hover: 'rgba(107,143,94,0.28)',
        active: 'rgba(107,143,94,0.45)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s infinite',
        'modal-in': 'modal-in 0.2s ease',
        'toast-in': 'toast-in 0.25s ease',
      },
      keyframes: {
        'pulse-dot': {
          '0%': { boxShadow: '0 0 0 0 rgba(74,222,128,0.45)' },
          '70%': { boxShadow: '0 0 0 5px rgba(74,222,128,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(74,222,128,0)' },
        },
        'modal-in': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
};
