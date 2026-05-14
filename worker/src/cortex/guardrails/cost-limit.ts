/**
 * Cost limit — verifica se o tenant ultrapassou o limite mensal de custo/mensagens.
 *
 * Lê da tabela `cortex_usage_daily` agregada no mês atual. Se Supabase off ou
 * migration 012 não aplicada, libera (degrada graceful).
 */

import { supabase } from '../../db/supabase.js';

export interface CostStatus {
  monthMessages: number;
  monthCostUsd: number;
  /** Limite excedido? Em qual dimensão? */
  exceeded: 'none' | 'messages' | 'cost';
}

const CACHE_TTL_MS = 30_000; // 30s cache
interface CacheEntry {
  status: CostStatus;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  if (!err) return false;
  if (err.code === '42P01') return true;
  return /relation .* does not exist/i.test(err.message ?? '');
}

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export async function getMonthlyUsage(tenantId: string): Promise<{
  messages: number;
  costUsd: number;
}> {
  if (!supabase) return { messages: 0, costUsd: 0 };

  try {
    const { data, error } = await supabase
      .from('cortex_usage_daily')
      .select('message_count, estimated_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('day', firstDayOfMonth());

    if (error) {
      if (isMissingTableError(error)) return { messages: 0, costUsd: 0 };
      console.warn('[cortex.cost] getMonthlyUsage erro:', error.message);
      return { messages: 0, costUsd: 0 };
    }

    let messages = 0;
    let costUsd = 0;
    for (const row of data ?? []) {
      messages += row.message_count ?? 0;
      costUsd += Number(row.estimated_cost_usd ?? 0);
    }
    return { messages, costUsd };
  } catch (err) {
    console.warn('[cortex.cost] getMonthlyUsage ex:', (err as Error).message);
    return { messages: 0, costUsd: 0 };
  }
}

export async function checkCostLimit(
  tenantId: string,
  monthlyMessageLimit?: number,
  monthlyCostLimitUsd?: number,
): Promise<CostStatus> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const { messages, costUsd } = await getMonthlyUsage(tenantId);

  let exceeded: CostStatus['exceeded'] = 'none';
  if (typeof monthlyMessageLimit === 'number' && messages >= monthlyMessageLimit) {
    exceeded = 'messages';
  } else if (typeof monthlyCostLimitUsd === 'number' && costUsd >= monthlyCostLimitUsd) {
    exceeded = 'cost';
  }

  const status: CostStatus = {
    monthMessages: messages,
    monthCostUsd: costUsd,
    exceeded,
  };

  cache.set(tenantId, { status, expiresAt: Date.now() + CACHE_TTL_MS });
  return status;
}

/** Incrementa contador diário do tenant — chamado pelo orchestrator no audit. */
export async function recordUsage(
  tenantId: string,
  usage: {
    messages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    errors?: number;
    blocked?: number;
  },
): Promise<void> {
  if (!supabase) return;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Upsert atomico — usa rpc seria ideal mas insert-on-conflict-update funciona
    const { error: insertErr } = await supabase.from('cortex_usage_daily').insert({
      tenant_id: tenantId,
      day: today,
      request_count: 1,
      message_count: usage.messages,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      estimated_cost_usd: usage.costUsd,
      error_count: usage.errors ?? 0,
      blocked_count: usage.blocked ?? 0,
    });

    if (insertErr && !isMissingTableError(insertErr)) {
      // Conflito → update incremental
      if (insertErr.code === '23505') {
        const { data: existing } = await supabase
          .from('cortex_usage_daily')
          .select(
            'request_count, message_count, input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd, error_count, blocked_count',
          )
          .eq('tenant_id', tenantId)
          .eq('day', today)
          .maybeSingle();
        if (existing) {
          await supabase
            .from('cortex_usage_daily')
            .update({
              request_count: (existing.request_count ?? 0) + 1,
              message_count: (existing.message_count ?? 0) + usage.messages,
              input_tokens: (existing.input_tokens ?? 0) + usage.inputTokens,
              output_tokens: (existing.output_tokens ?? 0) + usage.outputTokens,
              cache_read_tokens:
                (existing.cache_read_tokens ?? 0) + usage.cacheReadTokens,
              estimated_cost_usd:
                Number(existing.estimated_cost_usd ?? 0) + usage.costUsd,
              error_count: (existing.error_count ?? 0) + (usage.errors ?? 0),
              blocked_count: (existing.blocked_count ?? 0) + (usage.blocked ?? 0),
            })
            .eq('tenant_id', tenantId)
            .eq('day', today);
        }
      } else {
        console.warn('[cortex.cost] recordUsage erro:', insertErr.message);
      }
    }

    // Invalida cache
    cache.delete(tenantId);
  } catch (err) {
    console.warn('[cortex.cost] recordUsage ex:', (err as Error).message);
  }
}
