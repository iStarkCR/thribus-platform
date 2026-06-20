import { useEffect, useState } from 'react';

/**
 * Hook de tema light/dark.
 *
 * - Persiste preferência em localStorage (`thribus.theme`)
 * - Default: dark (preserva UX original do painel)
 * - Aplica/remove classe `light` no <html> — globals.css ativa `:root.light`
 * - Suporta atalho cross-component via custom event (mudou em uma aba → outras refletem)
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'thribus.theme';
const SYNC_EVENT = 'thribus-theme-change';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage indisponível (modo privado, etc) — silenciosamente cai pro default
  }
  return 'dark';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
  } else {
    root.classList.remove('light');
  }
}

/** Aplica o tema persistido ANTES do React montar (evita flash). */
export function initTheme(): void {
  applyTheme(readStoredTheme());
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Sincroniza com mudanças em outras abas/componentes
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ theme: Theme }>).detail;
      if (detail?.theme && detail.theme !== theme) {
        setThemeState(detail.theme);
        applyTheme(detail.theme);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignora
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { theme: t } }));
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return { theme, setTheme, toggle };
}

/* ─── Liquid Glass (tema opcional, independente do light/dark) ─────────────── */
const GLASS_KEY = 'thribus.glass';
const GLASS_EVENT = 'thribus-glass-change';

function readGlass(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(GLASS_KEY) === '1'; } catch { return false; }
}
function applyGlass(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('glass', on);
}
/** Aplica o estado de glass ANTES do React montar (evita flash). */
export function initGlass(): void { applyGlass(readGlass()); }

export function useGlass(): { glass: boolean; toggle: () => void } {
  const [glass, setGlass] = useState<boolean>(readGlass);
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ on: boolean }>).detail;
      if (detail) { setGlass(detail.on); applyGlass(detail.on); }
    };
    window.addEventListener(GLASS_EVENT, onSync);
    return () => window.removeEventListener(GLASS_EVENT, onSync);
  }, []);
  const toggle = () => {
    const next = !readGlass();
    setGlass(next);
    applyGlass(next);
    try { localStorage.setItem(GLASS_KEY, next ? '1' : '0'); } catch { /* ignora */ }
    window.dispatchEvent(new CustomEvent(GLASS_EVENT, { detail: { on: next } }));
  };
  return { glass, toggle };
}
