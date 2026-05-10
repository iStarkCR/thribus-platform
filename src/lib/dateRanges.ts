/**
 * Helpers pra ranges temporais usados nos filtros de Dashboard/Métricas.
 *
 * Centraliza a lógica de "início do mês", "30 dias atrás", "mês passado"
 * pra evitar inconsistências entre páginas.
 */

export type RangeKey =
  | 'today'
  | '7d'
  | '30d'
  | 'currentMonth'
  | 'lastMonth'
  | '3m'
  | '12m'
  | 'all';

export interface DateRange {
  key: RangeKey;
  label: string;
  /** Inclusive — execuções com timestamp >= this são incluídas */
  from: Date;
  /** Exclusive — execuções com timestamp < this são incluídas. Se null, sem teto. */
  to: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** Resolve uma `RangeKey` em `{ from, to }` concretos baseados em "agora". */
export function resolveRange(key: RangeKey): DateRange {
  const now = new Date();
  switch (key) {
    case 'today': {
      const from = startOfDay(now);
      return { key, label: 'Hoje', from, to: null };
    }
    case '7d': {
      const from = new Date(now.getTime() - 7 * DAY_MS);
      return { key, label: 'Últimos 7 dias', from, to: null };
    }
    case '30d': {
      const from = new Date(now.getTime() - 30 * DAY_MS);
      return { key, label: 'Últimos 30 dias', from, to: null };
    }
    case 'currentMonth': {
      const from = startOfMonth(now);
      return { key, label: 'Mês atual', from, to: null };
    }
    case 'lastMonth': {
      const startCurrent = startOfMonth(now);
      const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { key, label: 'Mês passado', from: startLast, to: startCurrent };
    }
    case '3m': {
      const from = new Date(now.getTime() - 90 * DAY_MS);
      return { key, label: 'Últimos 3 meses', from, to: null };
    }
    case '12m': {
      const from = new Date(now.getTime() - 365 * DAY_MS);
      return { key, label: 'Últimos 12 meses', from, to: null };
    }
    case 'all': {
      return { key, label: 'Todo período', from: new Date(0), to: null };
    }
  }
}

/** Range do mês ANTERIOR ao do range passado — usado pra cálculo MoM. */
export function previousPeriod(range: DateRange): DateRange {
  // Se é uma janela "Últimos N dias", o anterior é "N dias antes desses N dias"
  // Se é "mês atual", o anterior é "mês passado"
  // Se é "mês passado", o anterior é "ante-passado"
  const now = new Date();
  switch (range.key) {
    case 'today': {
      const yesterdayStart = new Date(startOfDay(now).getTime() - DAY_MS);
      return { key: 'today', label: 'Ontem', from: yesterdayStart, to: startOfDay(now) };
    }
    case '7d': {
      const from = new Date(now.getTime() - 14 * DAY_MS);
      const to = new Date(now.getTime() - 7 * DAY_MS);
      return { key: '7d', label: '7 dias anteriores', from, to };
    }
    case '30d': {
      const from = new Date(now.getTime() - 60 * DAY_MS);
      const to = new Date(now.getTime() - 30 * DAY_MS);
      return { key: '30d', label: '30 dias anteriores', from, to };
    }
    case 'currentMonth': {
      const startCurrent = startOfMonth(now);
      const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { key: 'lastMonth', label: 'Mês passado', from: startLast, to: startCurrent };
    }
    case 'lastMonth': {
      const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const startBeforeLast = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { key: 'lastMonth', label: 'Ante-passado', from: startBeforeLast, to: startLast };
    }
    case '3m': {
      const from = new Date(now.getTime() - 180 * DAY_MS);
      const to = new Date(now.getTime() - 90 * DAY_MS);
      return { key: '3m', label: '3 meses anteriores', from, to };
    }
    case '12m': {
      const from = new Date(now.getTime() - 730 * DAY_MS);
      const to = new Date(now.getTime() - 365 * DAY_MS);
      return { key: '12m', label: '12 meses anteriores', from, to };
    }
    case 'all': {
      // Sem comparativo significativo
      return { key: 'all', label: '—', from: new Date(0), to: new Date(0) };
    }
  }
}

/** True se `timestamp` cai dentro de `range`. */
export function inRange(timestamp: string | Date, range: DateRange): boolean {
  const t = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp.getTime();
  if (t < range.from.getTime()) return false;
  if (range.to !== null && t >= range.to.getTime()) return false;
  return true;
}

/** Lista ordenada de opções pra UI. */
export const RANGE_OPTIONS: RangeKey[] = [
  'today',
  '7d',
  '30d',
  'currentMonth',
  'lastMonth',
  '3m',
  '12m',
  'all',
];
