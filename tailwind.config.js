/** @type {import('tailwindcss').Config} */
/*
 * Cores dinâmicas via CSS Custom Properties — definidas em src/styles/globals.css
 * em :root (dark default) e :root.light (light theme).
 *
 * Sintaxe `rgb(var(--xxx) / <alpha-value>)` permite usar opacidade Tailwind
 * (ex: `bg-brand/10`, `text-creme/50`) com cores que mudam por tema.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // --font-ui é definida por useFont (default Manrope) → troca de fonte
        // re-renderiza toda a UI em tempo real. Manrope permanece como fallback.
        sans: ['var(--font-ui)', 'Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          4: 'rgb(var(--surface-4) / <alpha-value>)',
          hover: 'rgb(var(--surface-hover) / <alpha-value>)',
        },
        brand: {
          dim:     'rgb(var(--brand-dim) / <alpha-value>)',
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          bright:  'rgb(var(--brand-bright) / <alpha-value>)',
          glow:    'rgb(var(--brand-glow) / <alpha-value>)',
        },
        creme: {
          DEFAULT: 'rgb(var(--creme) / <alpha-value>)',
          dim:     'rgb(var(--creme-dim) / <alpha-value>)',
          mute:    'rgb(var(--creme-mute) / <alpha-value>)',
          faint:   'rgb(var(--creme-faint) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          bright:  'rgb(var(--gold-bright) / <alpha-value>)',
          dim:     'rgb(var(--gold-dim) / <alpha-value>)',
        },
        semantic: {
          green: 'rgb(var(--semantic-green) / <alpha-value>)',
          amber: 'rgb(var(--semantic-amber) / <alpha-value>)',
          red:   'rgb(var(--semantic-red) / <alpha-value>)',
          blue:  'rgb(var(--semantic-blue) / <alpha-value>)',
        },
      },
      borderColor: {
        // Borders derivam do brand com alpha controlado via CSS var por tema
        default: 'rgb(var(--border-default) / var(--border-default-alpha))',
        hover:   'rgb(var(--border-default) / var(--border-hover-alpha))',
        active:  'rgb(var(--border-default) / var(--border-active-alpha))',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s infinite',
        'modal-in': 'modal-in 0.2s ease',
        'toast-in': 'toast-in 0.25s ease',
        'effort-flow': 'effort-flow 2.4s linear infinite',
      },
      keyframes: {
        'effort-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
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
