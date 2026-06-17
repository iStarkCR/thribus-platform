/**
 * Cortex Brain — o "cérebro" do time. Modelo + capacidade (esforço) + uso real.
 *
 * O painel escolhe; a ponte (bridge, service role) lê `cortex_brain_config`
 * scope='global' e aplica `--model`/`--effort` em toda execução, gravando o
 * custo/tokens reais em `cortex_usage`. É o espelho do controle do Claude.
 */

import { supabase } from '@/lib/supabase';

export const cortexBrainConfigured = Boolean(supabase);

// ─── Catálogo Cortex Brain (rebrand dos modelos reais) ──────────────────────
// `model` é o alias do CLI (claude --model <alias>) — resolve sozinho pro modelo
// atual. `effortable` = esforço (capacidade) faz efeito (só opus/fable).

export type CortexModel = 'opus' | 'sonnet' | 'haiku' | 'fable';
export type CortexEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CortexBrain {
  model: CortexModel;
  /** Nome de marca exibido no painel. */
  name: string;
  /** Modelo real por trás (pra você saber qual é qual). */
  real: string;
  tagline: string;
  /** Esforço faz efeito? (CLI só aplica --effort em opus/fable) */
  effortable: boolean;
  /** 1 (lento) a 5 (rápido) — barrinha de velocidade. */
  speed: number;
  /** 1 a 5 — barrinha de inteligência. */
  intel: number;
  /** ~custo relativo por execução (1 barato, 5 caro). */
  cost: number;
}

export const CORTEX_BRAINS: CortexBrain[] = [
  {
    model: 'opus',
    name: 'Cortex Brain Max',
    real: 'Claude Opus 4.8 · 1M',
    tagline: 'Mais inteligente. Raciocínio profundo: relatórios, decisões, código difícil.',
    effortable: true,
    speed: 2,
    intel: 5,
    cost: 5,
  },
  {
    model: 'sonnet',
    name: 'Cortex Brain Core',
    real: 'Claude Sonnet 4.6',
    tagline: 'Equilíbrio velocidade/qualidade. Padrão para a maioria das demandas.',
    effortable: false,
    speed: 4,
    intel: 4,
    cost: 3,
  },
  {
    model: 'haiku',
    name: 'Cortex Brain Fast',
    real: 'Claude Haiku 4.5',
    tagline: 'Mais rápido e barato. Volume, triagem e respostas curtas.',
    effortable: false,
    speed: 5,
    intel: 2,
    cost: 1,
  },
  {
    model: 'fable',
    name: 'Cortex Brain Fable',
    real: 'Fable 5',
    tagline: 'Criativo. Conteúdo, copy e brainstorming com mais imaginação.',
    effortable: true,
    speed: 3,
    intel: 4,
    cost: 4,
  },
];

export function brainOf(model: CortexModel): CortexBrain {
  return CORTEX_BRAINS.find((b) => b.model === model) ?? CORTEX_BRAINS[0];
}

/** Níveis de capacidade (esforço), do mais rápido ao mais inteligente. */
export const EFFORT_LEVELS: Array<{ value: CortexEffort; label: string; hint: string }> = [
  { value: 'low', label: 'Rápido', hint: 'Resposta direta, menos raciocínio.' },
  { value: 'medium', label: 'Equilibrado', hint: 'Bom custo/benefício.' },
  { value: 'high', label: 'Inteligente', hint: 'Padrão recomendado.' },
  { value: 'xhigh', label: 'Profundo', hint: 'Pensa mais antes de agir.' },
  { value: 'max', label: 'Máximo', hint: 'Raciocínio máximo. Mais lento e caro.' },
];

export function effortIndex(e: CortexEffort): number {
  return Math.max(0, EFFORT_LEVELS.findIndex((l) => l.value === e));
}

// ─── Config ─────────────────────────────────────────────────────────────────
export interface CortexBrainConfig {
  model: CortexModel;
  effort: CortexEffort;
  monthlyBudgetUsd: number;
  maxBudgetUsd: number;
}

export const DEFAULT_CORTEX_CONFIG: CortexBrainConfig = {
  model: 'opus',
  effort: 'high',
  monthlyBudgetUsd: 0,
  maxBudgetUsd: 0,
};

interface ConfigRow {
  model: CortexModel;
  effort: CortexEffort;
  monthly_budget_usd: number | string;
  max_budget_usd: number | string;
}

export async function getCortexConfig(): Promise<CortexBrainConfig> {
  if (!supabase) return DEFAULT_CORTEX_CONFIG;
  const { data, error } = await supabase
    .from('cortex_brain_config')
    .select('model,effort,monthly_budget_usd,max_budget_usd')
    .eq('scope', 'global')
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_CORTEX_CONFIG;
  const r = data as ConfigRow;
  return {
    model: r.model,
    effort: r.effort,
    monthlyBudgetUsd: Number(r.monthly_budget_usd) || 0,
    maxBudgetUsd: Number(r.max_budget_usd) || 0,
  };
}

export async function saveCortexConfig(cfg: CortexBrainConfig): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('cortex_brain_config').upsert(
    {
      scope: 'global',
      model: cfg.model,
      effort: cfg.effort,
      monthly_budget_usd: cfg.monthlyBudgetUsd,
      max_budget_usd: cfg.maxBudgetUsd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'scope' },
  );
  if (error) throw error;
}

// ─── Uso & limites ──────────────────────────────────────────────────────────
export interface UsageRow {
  id: string;
  kind: 'demand' | 'chat';
  model: string | null;
  costUsd: number;
  totalTokens: number;
  durationMs: number;
  numTurns: number;
  createdAt: string;
}

export interface UsageSummary {
  /** custo/execuções/tokens nos últimos 30 dias */
  costMonth: number;
  costToday: number;
  cost7d: number;
  executions: number;
  totalTokens: number;
  avgDurationMs: number;
  /** custo por modelo (alias → usd) */
  byModel: Array<{ model: string; cost: number; runs: number }>;
  recent: UsageRow[];
}

interface UsageRowDB {
  id: string;
  kind: 'demand' | 'chat';
  model: string | null;
  cost_usd: number | string;
  total_tokens: number;
  duration_ms: number;
  num_turns: number;
  created_at: string;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const empty: UsageSummary = {
    costMonth: 0, costToday: 0, cost7d: 0, executions: 0,
    totalTokens: 0, avgDurationMs: 0, byModel: [], recent: [],
  };
  if (!supabase) return empty;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('cortex_usage')
    .select('id,kind,model,cost_usd,total_tokens,duration_ms,num_turns,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const rows = (data as UsageRowDB[]) ?? [];
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  const byModel = new Map<string, { cost: number; runs: number }>();
  let costMonth = 0, costToday = 0, cost7d = 0, totalTokens = 0, durSum = 0, durN = 0;

  for (const r of rows) {
    const cost = Number(r.cost_usd) || 0;
    const t = new Date(r.created_at).getTime();
    costMonth += cost;
    if (t >= dayAgo) costToday += cost;
    if (t >= weekAgo) cost7d += cost;
    totalTokens += r.total_tokens || 0;
    if (r.duration_ms) { durSum += r.duration_ms; durN++; }
    const key = r.model || '—';
    const m = byModel.get(key) ?? { cost: 0, runs: 0 };
    m.cost += cost; m.runs += 1;
    byModel.set(key, m);
  }

  return {
    costMonth, costToday, cost7d,
    executions: rows.length,
    totalTokens,
    avgDurationMs: durN ? Math.round(durSum / durN) : 0,
    byModel: [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost),
    recent: rows.slice(0, 8).map((r) => ({
      id: r.id, kind: r.kind, model: r.model,
      costUsd: Number(r.cost_usd) || 0, totalTokens: r.total_tokens || 0,
      durationMs: r.duration_ms || 0, numTurns: r.num_turns || 0, createdAt: r.created_at,
    })),
  };
}

let usageSeq = 0;
export function subscribeUsage(onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`cortex-usage:${++usageSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cortex_usage' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
