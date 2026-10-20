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
      screens: {
        // Viewport baixo (notebook 1366×768, Windows com zoom 125%) — compacta o hero
        short: { raw: '(max-height: 760px)' },
      },
      // Raios maiores e contínuos (HIG): tudo que já usa rounded-md/lg/xl/2xl
      // herda a nova escala sem tocar nos componentes.
      borderRadius: {
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 1px 2px rgb(0 0 0 / 0.18), 0 12px 32px -18px rgb(0 0 0 / 0.55)',
        pop: 'inset 0 1px 0 rgb(255 255 255 / 0.08), 0 24px 64px -20px rgb(0 0 0 / 0.6)',
        glow: '0 0 0 1px rgb(var(--brand) / 0.35), 0 10px 30px -10px rgb(var(--brand) / 0.6)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
      },
      fontFamily: {
        // --font-ui é definida por useFont (default Manrope) → troca de fonte
        // re-renderiza toda a UI em tempo real. Manrope permanece como fallback.
        sans: ['var(--font-ui)', 'Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        // Fonte da marca (wordmark "thribus." / PLATFORM) — independe da fonte da UI escolhida
        brand: ['Space Grotesk', 'Manrope', 'sans-serif'],
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
        'modal-in': 'modal-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
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
          from: { opacity: '0', transform: 'translateY(14px) scale(0.97)' },
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
