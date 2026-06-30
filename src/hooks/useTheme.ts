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

/* ─── Cor de destaque (accent) — POR cliente (workspace), muda os tokens --brand* ── */
export type Accent = 'sage' | 'gold' | 'blue' | 'violet' | 'coral';
const ACCENT_KEY = 'thribus.accent';            // legado (global) — só fallback/migração
const ACCENT_EVENT = 'thribus-accent-change';
const ACTIVE_WS_KEY = 'activeWorkspaceId';      // mesma chave que o useAppStore persiste
const WS_CHANGE_EVENT = 'thribus-workspace-change';
export const ACCENTS: Record<Accent, { dim: string; base: string; bright: string; glow: string } | null> = {
  sage:   null, // usa o default do globals.css (light/dark próprios)
  gold:   { dim: '150 120 58',  base: '198 164 90',  bright: '226 198 132', glow: '235 212 160' },
  blue:   { dim: '60 100 190',  base: '96 145 235',  bright: '130 175 250', glow: '165 200 255' },
  violet: { dim: '110 90 200',  base: '150 130 230', bright: '180 165 245', glow: '205 195 255' },
  coral:  { dim: '190 95 75',   base: '230 130 110', bright: '245 165 145', glow: '255 195 180' },
};
function activeWsId(): string {
  if (typeof window === 'undefined') return 'default';
  try { return localStorage.getItem(ACTIVE_WS_KEY) || 'default'; } catch { return 'default'; }
}
function accentKeyFor(wsId: string): string { return `${ACCENT_KEY}:${wsId}`; }
/** Accent do cliente ativo — cai pro accent legado global e depois pro default 'sage'. */
function readAccent(wsId: string = activeWsId()): Accent {
  if (typeof window === 'undefined') return 'sage';
  try {
    const v = localStorage.getItem(accentKeyFor(wsId));
    if (v && v in ACCENTS) return v as Accent;
    const legacy = localStorage.getItem(ACCENT_KEY); // preserva escolha antiga até o cliente customizar
    if (legacy && legacy in ACCENTS) return legacy as Accent;
  } catch { /* ignora */ }
  return 'sage';
}
function applyAccent(a: Accent): void {
  if (typeof document === 'undefined') return;
  const r = document.documentElement.style;
  const p = ACCENTS[a];
  if (!p) { ['--brand-dim', '--brand', '--brand-bright', '--brand-glow'].forEach((k) => r.removeProperty(k)); return; }
  r.setProperty('--brand-dim', p.dim); r.setProperty('--brand', p.base);
  r.setProperty('--brand-bright', p.bright); r.setProperty('--brand-glow', p.glow);
}
/** Aplica o accent do cliente ativo e reaplica sempre que troca de cliente (mesmo sem Settings montado). */
export function initAccent(): void {
  applyAccent(readAccent());
  if (typeof window !== 'undefined') {
    window.addEventListener(WS_CHANGE_EVENT, (e) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
      applyAccent(readAccent(id || activeWsId()));
    });
  }
}
export function useAccent(): { accent: Accent; setAccent: (a: Accent) => void } {
  const [accent, setA] = useState<Accent>(() => readAccent());
  useEffect(() => {
    const onAccent = (e: Event) => {
      const d = (e as CustomEvent<{ a: Accent; wsId: string }>).detail;
      if (d && d.wsId === activeWsId()) { setA(d.a); applyAccent(d.a); }
    };
    const onWs = (e: Event) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id || activeWsId();
      const a = readAccent(id);
      setA(a); applyAccent(a);
    };
    window.addEventListener(ACCENT_EVENT, onAccent);
    window.addEventListener(WS_CHANGE_EVENT, onWs);
    return () => {
      window.removeEventListener(ACCENT_EVENT, onAccent);
      window.removeEventListener(WS_CHANGE_EVENT, onWs);
    };
  }, []);
  const setAccent = (a: Accent) => {
    const wsId = activeWsId();
    setA(a); applyAccent(a);
    try { localStorage.setItem(accentKeyFor(wsId), a); } catch { /* ignora */ }
    window.dispatchEvent(new CustomEvent(ACCENT_EVENT, { detail: { a, wsId } }));
  };
  return { accent, setAccent };
}

/* ─── Escala da interface — zoom global (afeta TUDO, inclusive px fixos) ───── */
export type UiScale = 'sm' | 'md' | 'lg' | 'xl';
const SCALE_KEY = 'thribus.uiScale';
const SCALE_EVENT = 'thribus-uiscale-change';
export const UI_SCALE_VALUE: Record<UiScale, number> = { sm: 0.92, md: 1, lg: 1.1, xl: 1.22 };

function readScale(): UiScale {
  if (typeof window === 'undefined') return 'md';
  try {
    const v = localStorage.getItem(SCALE_KEY);
    if (v && v in UI_SCALE_VALUE) return v as UiScale;
  } catch { /* ignora */ }
  return 'md';
}
function applyScale(s: UiScale): void {
  if (typeof document === 'undefined') return;
  // `zoom` escala o sistema de coordenadas inteiro (px fixos incluídos) e
  // mantém o posicionamento de overlays/orbe coerente — diferente de transform.
  document.documentElement.style.setProperty('zoom', String(UI_SCALE_VALUE[s]));
}
/** Aplica a escala persistida ANTES do React montar (evita flash de tamanho). */
export function initFontScale(): void { applyScale(readScale()); }
export function useFontScale(): { scale: UiScale; setScale: (s: UiScale) => void } {
  const [scale, setS] = useState<UiScale>(readScale);
  useEffect(() => {
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<{ scale: UiScale }>).detail;
      if (d?.scale) { setS(d.scale); applyScale(d.scale); }
    };
    window.addEventListener(SCALE_EVENT, onSync);
    return () => window.removeEventListener(SCALE_EVENT, onSync);
  }, []);
  const setScale = (s: UiScale) => {
    setS(s); applyScale(s);
    try { localStorage.setItem(SCALE_KEY, s); } catch { /* ignora */ }
    window.dispatchEvent(new CustomEvent(SCALE_EVENT, { detail: { scale: s } }));
  };
  return { scale, setScale };
}

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
