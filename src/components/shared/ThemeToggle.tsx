import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

/**
 * Toggle light/dark. Renderiza um botão pequeno com ícone Sun (atual=light)
 * ou Moon (atual=dark). Click alterna e persiste em localStorage.
 *
 * Default visual segue padrão dos outros botões do Header (px-2 py-2,
 * rounded-lg, hover bg-surface-hover).
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';
  const Icon = isLight ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
      title={isLight ? 'Mudar pra tema escuro' : 'Mudar pra tema claro'}
      aria-label={isLight ? 'Mudar pra tema escuro' : 'Mudar pra tema claro'}
    >
      <Icon size={15} />
    </button>
  );
}
