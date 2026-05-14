/**
 * Audit log — escreve trilha de auditoria de toda chamada ao Brain.
 *
 * Graceful degrade: se Supabase não estiver configurado ou a tabela
 * `cortex_audit_log` não existir (migration 010 não aplicada), apenas loga
 * warning e segue — nunca quebra o caller.
 */

import { supabase } from '../../db/supabase.js';

export interface AuditEntry {
  tenantId: string;
  sessionId: string;
  traceId: string;
  channel?: string;
  entityType?: string;
  entityId?: string;
  inputText: string;
  selectedAgent?: string | null;
  intent?: string;
  confidence?: number;
  reasoning?: string;
  replyText?: string | null;
  actionsCount: number;
  insightsCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  model?: string;
  status: 'ok' | 'error' | 'blocked';
  errorMessage?: string;
}

const MAX_INPUT_CHARS = 4000;
const MAX_REPLY_CHARS = 4000;
const MAX_REASONING_CHARS = 500;

function truncate(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  if (!supabase) {
    console.debug('[cortex.audit] supabase offline — skip');
    return;
  }

  const row = {
    tenant_id: entry.tenantId,
    session_id: entry.sessionId,
    trace_id: entry.traceId,
    channel: entry.channel ?? null,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    input_text: truncate(entry.inputText, MAX_INPUT_CHARS) ?? '',
    input_chars: entry.inputText.length,
    selected_agent: entry.selectedAgent ?? null,
    intent: entry.intent ?? null,
    confidence: entry.confidence ?? null,
    reasoning: truncate(entry.reasoning, MAX_REASONING_CHARS),
    reply_text: truncate(entry.replyText, MAX_REPLY_CHARS),
    actions_count: entry.actionsCount,
    insights_count: entry.insightsCount,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cache_read_tokens: entry.cacheReadTokens,
    estimated_cost_usd: entry.estimatedCostUsd,
    latency_ms: entry.latencyMs,
    model: entry.model ?? null,
    status: entry.status,
    error_message: entry.errorMessage ?? null,
  };

  try {
    const { error } = await supabase.from('cortex_audit_log').insert(row);
    if (error) {
      // Tabela não existe → migration 010 não aplicada. Não bloqueia o caller.
      if (
        error.code === '42P01' ||
        /relation .* does not exist/i.test(error.message ?? '')
      ) {
        console.warn(
          '[cortex.audit] tabela cortex_audit_log não existe (migration 010 não aplicada).',
        );
        return;
      }
      console.warn('[cortex.audit] falha ao gravar:', error.message);
    }
  } catch (err) {
    console.warn('[cortex.audit] excecao:', (err as Error).message);
  }
}
