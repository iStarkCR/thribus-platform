/**
 * Memória curta — sessões in-memory com TTL.
 *
 * Fase 0: Map + setTimeout. Bom o suficiente pra um worker single-instance.
 * Fase 2: migra pra Redis sem mudar a interface pública.
 */

import type { CortexMessage, CortexSession, EntityRef } from '../types.js';

const SESSION_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_MESSAGES_PER_SESSION = 50;

interface SessionEntry {
  session: CortexSession;
  timer: NodeJS.Timeout;
}

const store = new Map<string, SessionEntry>();

/**
 * Hook chamado quando uma sessão estoura MAX_MESSAGES_PER_SESSION — permite
 * ao consolidation worker resumir as mensagens antes do descarte, sem
 * import circular entre os módulos.
 */
type OverflowHandler = (session: CortexSession) => void;
let overflowHandler: OverflowHandler | null = null;

function sessionKey(tenantId: string, sessionId: string): string {
  return `${tenantId}::${sessionId}`;
}

function refreshTimer(key: string, entry: SessionEntry): void {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    store.delete(key);
  }, SESSION_TTL_MS);
}

export const shortTermMemory = {
  get(tenantId: string, sessionId: string): CortexSession | null {
    const key = sessionKey(tenantId, sessionId);
    const entry = store.get(key);
    if (!entry) return null;
    refreshTimer(key, entry);
    return entry.session;
  },

  getOrCreate(
    tenantId: string,
    sessionId: string,
    init?: { entity?: EntityRef; channel?: string },
  ): CortexSession {
    const key = sessionKey(tenantId, sessionId);
    const existing = store.get(key);
    if (existing) {
      refreshTimer(key, existing);
      // Atualiza entity/channel se vieram novos (geralmente vêm iguais)
      if (init?.entity) existing.session.entity = init.entity;
      if (init?.channel) existing.session.channel = init.channel;
      return existing.session;
    }
    const now = new Date().toISOString();
    const session: CortexSession = {
      sessionId,
      tenantId,
      entity: init?.entity,
      channel: init?.channel,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    const entry: SessionEntry = {
      session,
      timer: setTimeout(() => store.delete(key), SESSION_TTL_MS),
    };
    store.set(key, entry);
    return session;
  },

  appendMessage(
    tenantId: string,
    sessionId: string,
    msg: CortexMessage,
  ): void {
    const key = sessionKey(tenantId, sessionId);
    const entry = store.get(key);
    if (!entry) return;
    entry.session.messages.push({
      ...msg,
      ts: msg.ts ?? new Date().toISOString(),
    });
    if (entry.session.messages.length > MAX_MESSAGES_PER_SESSION) {
      // Consolida em memória longa antes de descartar as antigas
      overflowHandler?.(entry.session);
      entry.session.messages = entry.session.messages.slice(
        -MAX_MESSAGES_PER_SESSION,
      );
    }
    entry.session.updatedAt = new Date().toISOString();
    refreshTimer(key, entry);
  },

  clear(tenantId: string, sessionId: string): void {
    const key = sessionKey(tenantId, sessionId);
    const entry = store.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      store.delete(key);
    }
  },

  /** Debug/health — quantas sessões estão na memória. */
  stats(): { totalSessions: number } {
    return { totalSessions: store.size };
  },

  /** Lista todas as sessões — usado pelo consolidation worker. */
  listAll(): CortexSession[] {
    return Array.from(store.values()).map((e) => e.session);
  },

  /** Registra o handler de overflow (consolidation worker). */
  setOverflowHandler(fn: OverflowHandler | null): void {
    overflowHandler = fn;
  },
};
