/** Helpers compartilhados do módulo de Demandas (prioridade, formatação de custo/tempo). */

export interface PriorityLevel { key: 'high' | 'normal' | 'low'; label: string; value: number; color: string; }

export const PRIORITIES: PriorityLevel[] = [
  { key: 'high', label: 'Alta', value: 2, color: '#f59e0b' },
  { key: 'normal', label: 'Normal', value: 0, color: '#64748b' },
  { key: 'low', label: 'Baixa', value: -1, color: '#475569' },
];

/** Prioridade (int, maior = mais urgente) → nível visual. Rotinas (3) caem em "Alta". */
export function priorityMeta(value: number): PriorityLevel {
  if (value >= 2) return PRIORITIES[0];
  if (value <= -1) return PRIORITIES[2];
  return PRIORITIES[1];
}

export function formatCost(usd: number): string {
  if (!usd) return '$0';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

export function formatTokens(n: number): string {
  if (!n) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return String(n);
}

/** Prazo relativo curto + se está vencido. */
export function dueMeta(dueDate: string | null): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  const diff = due - now;
  const overdue = diff < 0;
  const days = Math.round(Math.abs(diff) / 86_400_000);
  const hrs = Math.round(Math.abs(diff) / 3_600_000);
  const rel = days >= 1 ? `${days}d` : `${hrs}h`;
  return { label: overdue ? `venceu há ${rel}` : `vence em ${rel}`, overdue };
}
