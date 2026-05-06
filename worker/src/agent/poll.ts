/**
 * Polling fallback — busca mensagens novas do TexNet via API.
 *
 * Usado enquanto o webhook `message.received` do TexNet está bugado.
 * Cada iteração:
 *   1. Lista agents com canal definido
 *   2. Pra cada canal, lista leads (TexNet)
 *   3. Pra cada lead, busca o detalhado com mensagens
 *   4. Pra cada mensagem inbound nova (não está no banco), enfileira
 *
 * Configurar:
 *   POLL_INTERVAL_MS=15000  (default 15s)
 *   POLL_ENABLED=true       (default true; setar 'false' pra desligar)
 */

import { db } from '../db/index.js';
import * as crm from '../crm/client.js';
import { enqueue } from '../queue/index.js';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000);
const POLL_ENABLED = (process.env.POLL_ENABLED ?? 'true').toLowerCase() !== 'false';

let polling = false;

export function startPolling(): void {
  if (!POLL_ENABLED) {
    console.log('[poll] desligado (POLL_ENABLED=false)');
    return;
  }
  console.log(`[poll] iniciado — intervalo ${POLL_INTERVAL_MS}ms`);
  setInterval(() => {
    if (polling) {
      console.log('[poll] iteração anterior ainda rodando — pulando');
      return;
    }
    polling = true;
    runOnce()
      .catch((err) => console.error('[poll] erro na iteração:', err))
      .finally(() => {
        polling = false;
      });
  }, POLL_INTERVAL_MS);
}

async function runOnce(): Promise<void> {
  const agents = await db.agents.listWithChannel();
  if (agents.length === 0) return;

  // Agrupa agents por canal (1 canal = 1 agent na tabela, mas defensivo)
  const channelToAgent = new Map<string, (typeof agents)[number]>();
  for (const a of agents) {
    if (a.channel && !channelToAgent.has(a.channel)) {
      channelToAgent.set(a.channel, a);
    }
  }

  for (const [channel, agent] of channelToAgent) {
    let leadsList: crm.Lead[] = [];
    try {
      leadsList = await crm.leads.list({ channel, limit: 50 });
    } catch (err) {
      // Se TexNet não tiver endpoint /leads?channel=, tenta sem filtro
      try {
        const all = await crm.leads.list({ limit: 100 });
        leadsList = all.filter((l) => l.channel === channel);
      } catch (err2) {
        console.warn(`[poll] falha ao listar leads (channel=${channel}):`, (err2 as Error).message);
        continue;
      }
    }

    for (const lead of leadsList) {
      // Pula se humano assumiu
      if (lead.botMode === false && lead.responsibleId) continue;

      // Busca lead completo com mensagens
      let fullLead: crm.Lead;
      try {
        fullLead = await crm.leads.get(lead.id);
      } catch (err) {
        console.warn(`[poll] falha ao buscar lead ${lead.id}:`, (err as Error).message);
        continue;
      }

      // Busca a ÚLTIMA mensagem inbound de texto que ainda não está no nosso banco
      const inboundMessages = (fullLead.messages ?? [])
        .filter((m) => m.direction === 'inbound' && m.type === 'text' && m.content?.trim())
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (inboundMessages.length === 0) continue;

      const latest = inboundMessages[inboundMessages.length - 1];
      const exists = await db.messages.exists(latest.id);
      if (exists) continue;

      // Mensagem nova — enfileira
      console.log(`[poll] nova msg lead=${fullLead.id} msgId=${latest.id} content="${latest.content.slice(0, 60)}..."`);

      enqueue({
        agentId: agent.id,
        leadId: fullLead.id,
        messageId: latest.id,
        customerPhone: fullLead.phone,
        customerName: fullLead.name,
        content: latest.content,
        messageType: latest.type,
        channel: fullLead.channel ?? channel,
        leadStage: fullLead.stage,
      });
    }
  }
}
