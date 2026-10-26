/**
 * Cortex Brain — o "cérebro" do time. Modelo + capacidade (esforço) + uso real.
 *
 * A escolha de modelo é POR conversa: o override vive em `chat_sessions`
 * (model_override/effort_override) — ver getSessionOverride/saveSessionOverride.
 * Sem override, a sessão roda em AUTO (a ponte roteia por mensagem). O
 * `cortex_brain_config` scope='global' segue só pra budget/teto de contexto e
 * fallback. A ponte grava custo/tokens reais em `cortex_usage`.
 */

import { supabase } from '@/lib/supabase';

export const cortexBrainConfigured = Boolean(supabase);

// ─── Catálogo Cortex Brain (rebrand dos modelos reais) ──────────────────────
// `model` é o alias do CLI (claude --model <alias>) — resolve sozinho pro modelo
// atual. `effortable` = esforço (capacidade) faz efeito (só opus/fable).

export type CortexModel = 'opus' | 'sonnet' | 'haiku' | 'fable';
export type CortexEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

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
    real: 'Claude Opus 5.5 · 1M',
    tagline: 'Mais inteligente. Raciocínio profundo: relatórios, decisões, código difícil.',
    effortable: true,
    speed: 2,
    intel: 5,
    cost: 5,
  },
  {
    model: 'sonnet',
    name: 'Cortex Brain Core',
    real: 'Claude Sonnet 5.5',
    tagline: 'Equilíbrio velocidade/qualidade. Padrão para a maioria das demandas.',
    effortable: false,
    speed: 4,
    intel: 4,
    cost: 3,
  },
  {
    model: 'haiku',
    name: 'Cortex Brain Fast',
    real: 'Claude Haiku 5.5',
    tagline: 'Mais rápido e barato. Volume, triagem e respostas curtas.',
    effortable: false,
    speed: 5,
    intel: 2,
    cost: 1,
  },
  {
    model: 'fable',
    name: 'Cortex Brain Fable',
    real: 'Fable 5.1',
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

/** Níveis de capacidade (esforço), do mais rápido ao mais inteligente. 6 divisões:
 * as 5 do CLI (low→max) + Ultracode no topo (mapeado pra max na ponte). */
export const EFFORT_LEVELS: Array<{ value: CortexEffort; label: string; hint: string }> = [
  { value: 'low', label: 'Rápido', hint: 'Resposta direta, menos raciocínio.' },
  { value: 'medium', label: 'Médio', hint: 'Equilíbrio bom.' },
  { value: 'high', label: 'Alto', hint: 'Padrão recomendado.' },
  { value: 'xhigh', label: 'Muito alto', hint: 'Pensa bastante antes de agir.' },
  { value: 'max', label: 'Máximo', hint: 'Raciocínio máximo.' },
  { value: 'ultra', label: 'Ultracode', hint: 'Esforço total — mais lento e caro, pro mais difícil.' },
];

export function effortIndex(e: CortexEffort): number {
  return Math.max(0, EFFORT_LEVELS.findIndex((l) => l.value === e));
}

// ─── Config ─────────────────────────────────────────────────────────────────
/** 'auto' = Cortex Router decide o modelo por mensagem; 'manual' = modelo fixo. */
export type CortexMode = 'auto' | 'manual';

// Teto de contexto: quanto a conversa acumula (tokens do turno) antes de o daemon
// rotacionar / a ponte resetar a sessão. O gatilho REAL da ponte é 70% deste
// valor (CONTEXT_RESET_FRACTION) — compacta antes de encostar no teto; o custo
// por turno escala linear com a janela. Piso 100k; teto 1M (janela do Max).
export const CONTEXT_LIMIT_MIN = 100_000;
export const CONTEXT_LIMIT_MAX = 1_000_000;
export const CONTEXT_LIMIT_STEP = 50_000;
export const CONTEXT_RESET_FRACTION = 0.7;

const clampContext = (n: number) =>
  Math.min(CONTEXT_LIMIT_MAX, Math.max(CONTEXT_LIMIT_MIN, Math.round(n) || CONTEXT_LIMIT_MIN));

export interface CortexBrainConfig {
  /** 'auto' = roteador escolhe; 'manual' = o `model` abaixo é fixo (override). */
  mode: CortexMode;
  model: CortexModel;
  effort: CortexEffort;
  monthlyBudgetUsd: number;
  maxBudgetUsd: number;
  /** Teto de contexto (tokens) antes de rotacionar/resetar a conversa. */
  contextLimitTokens: number;
}

export const DEFAULT_CORTEX_CONFIG: CortexBrainConfig = {
  mode: 'auto',
  model: 'opus',
  effort: 'high',
  monthlyBudgetUsd: 0,
  maxBudgetUsd: 0,
  contextLimitTokens: CONTEXT_LIMIT_MIN,
};

interface ConfigRow {
  mode?: CortexMode | null;
  model: CortexModel;
  effort: CortexEffort;
  monthly_budget_usd: number | string;
  max_budget_usd: number | string;
  context_limit_tokens: number | string | null;
}

export async function getCortexConfig(): Promise<CortexBrainConfig> {
  if (!supabase) return DEFAULT_CORTEX_CONFIG;
  const { data, error } = await supabase
    .from('cortex_brain_config')
    .select('mode,model,effort,monthly_budget_usd,max_budget_usd,context_limit_tokens')
    .eq('scope', 'global')
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_CORTEX_CONFIG;
  const r = data as ConfigRow;
  return {
    mode: r.mode === 'manual' ? 'manual' : 'auto',
    model: r.model,
    effort: r.effort,
    monthlyBudgetUsd: Number(r.monthly_budget_usd) || 0,
    maxBudgetUsd: Number(r.max_budget_usd) || 0,
    contextLimitTokens: clampContext(Number(r.context_limit_tokens)),
  };
}

export async function saveCortexConfig(cfg: CortexBrainConfig): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('cortex_brain_config').upsert(
    {
      scope: 'global',
      mode: cfg.mode,
      model: cfg.model,
      effort: cfg.effort,
      monthly_budget_usd: cfg.monthlyBudgetUsd,
      max_budget_usd: cfg.maxBudgetUsd,
      context_limit_tokens: clampContext(cfg.contextLimitTokens),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'scope' },
  );
  if (error) throw error;
}

// ─── Roteamento (badge por resposta) ────────────────────────────────────────
// Em modo auto a ponte grava tier/reason em cortex_usage (ref_id = id da msg do
// usuário). O chat lê isso pra mostrar "roteado: opus · high — sinal pesado".

export interface RoutingInfo {
  model: string;
  effort: string | null;
  tier: string | null;
  reason: string | null;
}

interface RoutingRow {
  ref_id: string | null;
  model: string | null;
  effort: string | null;
  tier: string | null;
  reason: string | null;
}

/** Roteamento por mensagem do usuário (ref_id → info). Vazio em erro/sem migration. */
export async function getRoutingForRefs(refIds: string[]): Promise<Record<string, RoutingInfo>> {
  if (!supabase || !refIds.length) return {};
  const { data, error } = await supabase
    .from('cortex_usage')
    .select('ref_id,model,effort,tier,reason')
    .eq('kind', 'chat')
    .in('ref_id', refIds)
    .not('tier', 'is', null);
  if (error || !data) return {};
  const out: Record<string, RoutingInfo> = {};
  for (const r of data as RoutingRow[]) {
    if (r.ref_id) out[r.ref_id] = { model: r.model ?? '', effort: r.effort, tier: r.tier, reason: r.reason };
  }
  return out;
}

/** Atualiza só o teto de contexto (usado pelo controle rápido dentro do chat). */
export async function updateContextLimit(tokens: number): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('cortex_brain_config')
    .update({ context_limit_tokens: clampContext(tokens), updated_at: new Date().toISOString() })
    .eq('scope', 'global');
  if (error) throw error;
}

// ─── Override por sessão (modelo/esforço POR conversa) ──────────────────────
// A escolha de modelo é POR conversa: fica em chat_sessions.model_override /
// effort_override. null = sem override → a sessão segue AUTO (roteador decide).
// O cortex_brain_config global segue existindo, mas só pra budget/teto de
// contexto/fallback — não decide mais o modelo de toda sessão.

export interface SessionOverride {
  mode: 'auto' | 'manual';
  model: CortexModel | null;
  effort: CortexEffort | null;
}

export async function getSessionOverride(sessionId: string): Promise<SessionOverride> {
  if (!supabase || !sessionId) return { mode: 'auto', model: null, effort: null };
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('model_override,effort_override')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data || !data.model_override) return { mode: 'auto', model: null, effort: null };
  return {
    mode: 'manual',
    model: data.model_override as CortexModel,
    effort: (data.effort_override as CortexEffort) ?? 'high',
  };
}

export async function saveSessionOverride(
  sessionId: string,
  patch: { mode: 'auto' | 'manual'; model?: CortexModel; effort?: CortexEffort },
): Promise<void> {
  if (!supabase || !sessionId) throw new Error('sessão inválida');
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      model_override: patch.mode === 'manual' ? patch.model ?? null : null,
      effort_override: patch.mode === 'manual' ? patch.effort ?? null : null,
    })
    .eq('id', sessionId);
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

// ─── Limites do plano (5h + semana) — espelho do /usage do Claude ───────────
// A ponte sonda os headers anthropic-ratelimit-unified-* e grava em
// cortex_brain_limits. Aqui o painel lê pra mostrar quanto resta de cada janela.
export interface BrainLimits {
  fiveHUtil: number | null;   // 0..1
  fiveHReset: string | null;  // ISO
  fiveHStatus: string | null;
  sevenDUtil: number | null;
  sevenDReset: string | null;
  sevenDStatus: string | null;
  updatedAt: string | null;
}

export async function getBrainLimits(): Promise<BrainLimits | null> {
  const sb = supabase;
  if (!sb) return null;
  const { data } = await sb
    .from('cortex_brain_limits')
    .select('five_h_utilization,five_h_reset,five_h_status,seven_d_utilization,seven_d_reset,seven_d_status,updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (!data) return null;
  return {
    fiveHUtil: data.five_h_utilization == null ? null : Number(data.five_h_utilization),
    fiveHReset: data.five_h_reset,
    fiveHStatus: data.five_h_status,
    sevenDUtil: data.seven_d_utilization == null ? null : Number(data.seven_d_utilization),
    sevenDReset: data.seven_d_reset,
    sevenDStatus: data.seven_d_status,
    updatedAt: data.updated_at,
  };
}

let limitsSeq = 0;
export function subscribeBrainLimits(onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`cortex-limits:${++limitsSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cortex_brain_limits' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
