/**
 * Registra custo de chamadas NÃO-chat (Whisper STT, TTS, embeddings) na tabela
 * `cortex_usage` — pra esses gastos (que não entram no executions.cost_usd)
 * aparecerem no painel Cortex Brain, separados por `kind`.
 *
 * Fire-and-forget: nunca lança nem bloqueia a operação que gerou o custo.
 * Grava via service role (bypassa RLS); o painel mostra pra super-admin.
 */
import { supabase } from '../db/supabase.js';

export type AuxUsageKind = 'tts' | 'whisper' | 'embedding';

export async function recordAuxUsage(row: {
  kind: AuxUsageKind;
  model: string;
  costUsd: number;
  agentId?: string | null;
  totalTokens?: number;
  durationMs?: number;
}): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('cortex_usage').insert({
      agent_id: row.agentId ?? null,
      kind: row.kind,
      model: row.model,
      cost_usd: row.costUsd,
      total_tokens: row.totalTokens ?? 0,
      duration_ms: row.durationMs ?? 0,
      num_turns: 1,
    });
    if (error) console.warn('[aux-usage] insert erro:', error.message);
  } catch (err) {
    console.warn('[aux-usage] insert ex:', (err as Error).message);
  }
}
