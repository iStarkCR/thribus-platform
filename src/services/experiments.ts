/**
 * Experiments — A/B tests com significância estatística.
 */

import { supabase } from '@/lib/supabase';
import type { Experiment, ExperimentVariant, ExperimentStatus } from '@/lib/seed-experiments';

export const experimentsConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface ExperimentRow {
  id: string; workspace_id: string; agent_id: string | null;
  name: string; hypothesis: string | null;
  primary_metric: Experiment['primaryMetric']; status: ExperimentStatus;
  winner: string | null; significance: number;
  started_at: string | null; ended_at: string | null;
  duration_days: number; created_at: string;
}

interface VariantStatsRow {
  experiment_id: string; variant_id: string; label: string;
  prompt_version_label: string | null; traffic_share: number;
  exposures: number; successes: number;
  conversion_rate: number; avg_latency_ms: number; avg_cost: number;
}

export async function listExperiments(workspaceId: string): Promise<Experiment[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Pra cada experimento, busca stats agregadas
  const experiments = (data ?? []) as ExperimentRow[];
  return await Promise.all(experiments.map(async (r) => {
    const variants = await listVariantStats(r.id);
    const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);
    return {
      id: r.id, agentId: r.agent_id ?? '', agentName: '',
      workspaceId: r.workspace_id,
      name: r.name, hypothesis: r.hypothesis ?? '',
      primaryMetric: r.primary_metric, status: r.status,
      variants, significance: Number(r.significance),
      winner: (r.winner as Experiment['winner']) ?? 'pending',
      startedAt: r.started_at ?? r.created_at,
      endedAt: r.ended_at ?? undefined,
      durationDays: r.duration_days,
      totalExposures,
    };
  }));
}

export async function listVariantStats(experimentId: string): Promise<ExperimentVariant[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('experiment_variant_stats')
    .select('*')
    .eq('experiment_id', experimentId)
    .order('label');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as VariantStatsRow;
    return {
      id: row.variant_id, label: row.label,
      promptVersionId: '',
      promptVersionLabel: row.prompt_version_label ?? row.label,
      trafficShare: row.traffic_share,
      exposures: row.exposures, successes: row.successes,
      conversionRate: Number(row.conversion_rate),
      avgLatencyMs: row.avg_latency_ms,
      avgCost: Number(row.avg_cost),
    };
  });
}

export interface SignificanceResult {
  variantA: string; variantB: string;
  rateA: number; rateB: number;
  lift: number; zScore: number; significance: number;
  winner: 'A' | 'B' | 'pending';
}

export async function computeSignificance(experimentId: string): Promise<SignificanceResult | null> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.rpc('experiment_significance', { exp_id: experimentId });
  if (error) throw error;
  const row = (data?.[0] as Record<string, unknown> | undefined);
  if (!row) return null;
  return {
    variantA: row.variant_a as string,
    variantB: row.variant_b as string,
    rateA: Number(row.rate_a),
    rateB: Number(row.rate_b),
    lift: Number(row.lift),
    zScore: Number(row.z_score),
    significance: Number(row.significance),
    winner: row.winner as 'A' | 'B' | 'pending',
  };
}

export async function startExperiment(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('experiments')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function concludeExperiment(id: string, winner: 'A' | 'B' | 'tie'): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('experiments')
    .update({ status: 'concluded', winner, ended_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
