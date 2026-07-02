import { useEffect, useState } from 'react';

/**
 * Hook de fonte da UI.
 *
 * - Persiste preferência em localStorage (`thribus.font`)
 * - Default: manrope (fonte original do painel)
 * - Aplica setando a CSS var `--font-ui` em document.documentElement.
 *   O Tailwind consome `var(--font-ui)` em fontFamily.sans, então trocar
 *   a var re-renderiza toda a UI em tempo real (igual ao tema/accent).
 * - Sincroniza cross-component via custom event.
 */

export type Font = 'manrope' | 'inter' | 'plus-jakarta' | 'ibm-plex' | 'space-grotesk';

const STORAGE_KEY = 'thribus.font';
const SYNC_EVENT = 'thribus-font-change';

const FALLBACK = 'system-ui, sans-serif';

export const FONTS: Record<Font, { label: string; stack: string }> = {
  manrope:        { label: 'Manrope',           stack: `'Manrope', ${FALLBACK}` },
  inter:          { label: 'Inter',             stack: `'Inter', ${FALLBACK}` },
  'plus-jakarta': { label: 'Plus Jakarta Sans', stack: `'Plus Jakarta Sans', ${FALLBACK}` },
  'ibm-plex':     { label: 'IBM Plex Sans',     stack: `'IBM Plex Sans', ${FALLBACK}` },
  'space-grotesk':{ label: 'Space Grotesk',     stack: `'Space Grotesk', ${FALLBACK}` },
};

function readStoredFont(): Font {
  if (typeof window === 'undefined') return 'manrope';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in FONTS) return stored as Font;
  } catch {
    // localStorage indisponível (modo privado, etc) — cai pro default
  }
  return 'manrope';
}

function applyFont(font: Font): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--font-ui', FONTS[font].stack);
}

/** Aplica a fonte persistida ANTES do React montar (evita flash de fonte errada). */
export function initFont(): void {
  applyFont(readStoredFont());
}

export function useFont(): { font: Font; setFont: (f: Font) => void } {
  const [font, setFontState] = useState<Font>(readStoredFont);

  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ font: Font }>).detail;
      if (detail?.font && detail.font !== font) {
        setFontState(detail.font);
        applyFont(detail.font);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [font]);

  const setFont = (f: Font) => {
    setFontState(f);
    applyFont(f);
    try {
      localStorage.setItem(STORAGE_KEY, f);
    } catch {
      // ignora
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { font: f } }));
  };

  return { font, setFont };
}
