/**
 * Memória longa — Postgres.
 *
 * 3 escopos:
 *   - Entity memory: perfil consolidado por entidade
 *   - Facts:         fatos discretos aprendidos
 *   - Summaries:     resumos de sessões antigas
 *
 * Degrada silenciosamente se Supabase off ou migration 011 não aplicada.
 */

import { supabase } from '../../db/supabase.js';
import type { EntityRef } from '../types.js';

export interface EntityMemory {
  profileText: string;
  attrs: Record<string, unknown>;
  totalSessions: number;
  totalMessages: number;
  lastSeenAt?: string;
}

export interface CortexFact {
  factText: string;
  category?: string;
  confidence: number;
  sourceSession?: string;
  validUntil?: string;
}

export interface SessionSummary {
  sessionId: string;
  summaryText: string;
  topIntents: string[];
  agentsInvolved: string[];
  messageCount: number;
  totalCostUsd: number;
  createdAt: string;
}

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  if (!err) return false;
  if (err.code === '42P01') return true;
  return /relation .* does not exist/i.test(err.message ?? '');
}

export const longTermMemory = {
  async getEntity(
    tenantId: string,
    entity: EntityRef,
  ): Promise<EntityMemory | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('cortex_entity_memory')
        .select('profile_text, attrs, total_sessions, total_messages, last_seen_at')
        .eq('tenant_id', tenantId)
        .eq('entity_type', entity.type)
        .eq('entity_id', entity.id)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        console.warn('[cortex.memory.long] getEntity erro:', error.message);
        return null;
      }
      if (!data) return null;
      return {
        profileText: data.profile_text ?? '',
        attrs: (data.attrs as Record<string, unknown>) ?? {},
        totalSessions: data.total_sessions ?? 0,
        totalMessages: data.total_messages ?? 0,
        lastSeenAt: data.last_seen_at ?? undefined,
      };
    } catch (err) {
      console.warn('[cortex.memory.long] getEntity ex:', (err as Error).message);
      return null;
    }
  },

  async upsertEntity(
    tenantId: string,
    entity: EntityRef,
    update: Partial<EntityMemory>,
  ): Promise<void> {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('cortex_entity_memory')
        .upsert(
          {
            tenant_id: tenantId,
            entity_type: entity.type,
            entity_id: entity.id,
            profile_text: update.profileText,
            attrs: update.attrs,
            total_sessions: update.totalSessions,
            total_messages: update.totalMessages,
            last_seen_at: update.lastSeenAt ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,entity_type,entity_id' },
        );
      if (error && !isMissingTableError(error)) {
        console.warn('[cortex.memory.long] upsertEntity erro:', error.message);
      }
    } catch (err) {
      console.warn('[cortex.memory.long] upsertEntity ex:', (err as Error).message);
    }
  },

  async touchEntity(
    tenantId: string,
    entity: EntityRef,
    deltaMessages: number,
  ): Promise<void> {
    const existing = await this.getEntity(tenantId, entity);
    await this.upsertEntity(tenantId, entity, {
      profileText: existing?.profileText ?? '',
      attrs: { ...(existing?.attrs ?? {}), ...(entity.attrs ?? {}) },
      totalSessions: (existing?.totalSessions ?? 0) + (existing ? 0 : 1),
      totalMessages: (existing?.totalMessages ?? 0) + deltaMessages,
      lastSeenAt: new Date().toISOString(),
    });
  },

  async listFacts(
    tenantId: string,
    entity: EntityRef,
    limit = 20,
  ): Promise<CortexFact[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('cortex_facts')
        .select('fact_text, category, confidence, source_session, valid_until')
        .eq('tenant_id', tenantId)
        .eq('entity_type', entity.type)
        .eq('entity_id', entity.id)
        .or('valid_until.is.null,valid_until.gt.now()')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        console.warn('[cortex.memory.long] listFacts erro:', error.message);
        return [];
      }
      return (data ?? []).map((r) => ({
        factText: r.fact_text,
        category: r.category ?? undefined,
        confidence: Number(r.confidence ?? 0.5),
        sourceSession: r.source_session ?? undefined,
        validUntil: r.valid_until ?? undefined,
      }));
    } catch (err) {
      console.warn('[cortex.memory.long] listFacts ex:', (err as Error).message);
      return [];
    }
  },

  async addFact(
    tenantId: string,
    entity: EntityRef,
    fact: CortexFact,
  ): Promise<void> {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('cortex_facts').insert({
        tenant_id: tenantId,
        entity_type: entity.type,
        entity_id: entity.id,
        fact_text: fact.factText.slice(0, 1000),
        category: fact.category,
        confidence: fact.confidence,
        source_session: fact.sourceSession,
        valid_until: fact.validUntil,
      });
      if (error && !isMissingTableError(error)) {
        console.warn('[cortex.memory.long] addFact erro:', error.message);
      }
    } catch (err) {
      console.warn('[cortex.memory.long] addFact ex:', (err as Error).message);
    }
  },

  async listRecentSummariesForEntity(
    tenantId: string,
    entity: EntityRef,
    limit = 5,
  ): Promise<SessionSummary[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('cortex_session_summaries')
        .select(
          'session_id, summary_text, top_intents, agents_involved, message_count, total_cost_usd, created_at',
        )
        .eq('tenant_id', tenantId)
        .eq('entity_type', entity.type)
        .eq('entity_id', entity.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        console.warn('[cortex.memory.long] listSummaries erro:', error.message);
        return [];
      }
      return (data ?? []).map((r) => ({
        sessionId: r.session_id,
        summaryText: r.summary_text,
        topIntents: r.top_intents ?? [],
        agentsInvolved: r.agents_involved ?? [],
        messageCount: r.message_count ?? 0,
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.warn('[cortex.memory.long] listSummaries ex:', (err as Error).message);
      return [];
    }
  },

  async saveSummary(
    tenantId: string,
    sessionId: string,
    entity: EntityRef | undefined,
    summary: Omit<SessionSummary, 'sessionId' | 'createdAt'>,
  ): Promise<void> {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('cortex_session_summaries').insert({
        tenant_id: tenantId,
        session_id: sessionId,
        entity_type: entity?.type ?? null,
        entity_id: entity?.id ?? null,
        summary_text: summary.summaryText.slice(0, 4000),
        top_intents: summary.topIntents,
        agents_involved: summary.agentsInvolved,
        message_count: summary.messageCount,
        total_cost_usd: summary.totalCostUsd,
      });
      if (error && !isMissingTableError(error)) {
        console.warn('[cortex.memory.long] saveSummary erro:', error.message);
      }
    } catch (err) {
      console.warn('[cortex.memory.long] saveSummary ex:', (err as Error).message);
    }
  },
};

/** Helper pra montar bloco de contexto pra injetar no Brain. */
export function formatMemoryContext(
  entityMem: EntityMemory | null,
  facts: CortexFact[],
  summaries: SessionSummary[],
): string {
  if (!entityMem && facts.length === 0 && summaries.length === 0) return '';

  const parts: string[] = ['[MEMÓRIA LONGA]'];

  if (entityMem) {
    parts.push(
      `Perfil: ${entityMem.profileText || '(sem perfil consolidado ainda)'}`,
    );
    parts.push(
      `Sessões prévias: ${entityMem.totalSessions} | Mensagens totais: ${entityMem.totalMessages}`,
    );
    if (entityMem.lastSeenAt) {
      parts.push(`Última interação: ${entityMem.lastSeenAt}`);
    }
  }

  if (facts.length > 0) {
    parts.push(
      `Fatos conhecidos (${facts.length}):\n${facts
        .slice(0, 10)
        .map((f) => `- ${f.factText}${f.category ? ` [${f.category}]` : ''}`)
        .join('\n')}`,
    );
  }

  if (summaries.length > 0) {
    parts.push(
      `Sessões anteriores recentes:\n${summaries
        .slice(0, 3)
        .map(
          (s) =>
            `- [${s.createdAt.slice(0, 10)}] ${s.summaryText.slice(0, 200)}`,
        )
        .join('\n')}`,
    );
  }

  return parts.join('\n');
}
