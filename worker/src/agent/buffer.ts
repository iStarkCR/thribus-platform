/**
 * Message Buffer (debounce per conversation)
 *
 * Quando o cliente manda 3 mensagens rápidas em sequência, queremos:
 *   - Esperar ele PARAR de digitar (~5s sem novas mensagens)
 *   - Combinar tudo num único contexto
 *   - Bot responde UMA vez com a resposta certa pra todas
 *
 * Sem isso: bot responde a primeira → cliente continua digitando → bot
 * responde a segunda baseado em estado parcial → respostas conflitantes.
 *
 * Configurável:
 *   MESSAGE_BUFFER_MS=8000  (default 8s — aumentado de 5s em 09/05/2026 após
 *     observar caso "Travessa Esperança" onde cliente mandou rua, número e
 *     bairro em 3 mensagens consecutivas e o buffer flushou antes da 3ª chegar)
 *   MESSAGE_BUFFER_ENABLED=true (default true; setar 'false' pra desligar)
 */

import { enqueue, type AgentJob } from '../queue/index.js';

const BUFFER_MS = Number(process.env.MESSAGE_BUFFER_MS ?? 8000);
const BUFFER_ENABLED = (process.env.MESSAGE_BUFFER_ENABLED ?? 'true').toLowerCase() !== 'false';

interface PendingBuffer {
  jobs: AgentJob[];
  timer: NodeJS.Timeout;
}

const buffers = new Map<string, PendingBuffer>();

/**
 * Adiciona um job no buffer da conversa. Se for o primeiro, inicia o timer.
 * Se já tem buffer ativo, anexa e reseta o timer.
 *
 * Após N ms sem novos jobs, combina tudo em UM job e enfileira.
 */
export function bufferEnqueue(job: AgentJob): void {
  if (!BUFFER_ENABLED) {
    enqueue(job);
    return;
  }

  const key = `${job.channel}::${job.leadId}`;
  const existing = buffers.get(key);

  if (existing) {
    // Já tem buffer ativo — anexa e reseta timer
    existing.jobs.push(job);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flush(key), BUFFER_MS);
    console.log(
      `[buffer] +msg lead=${job.leadId} count=${existing.jobs.length} reset timer ${BUFFER_MS}ms`,
    );
    return;
  }

  // Primeiro job da conversa
  const pending: PendingBuffer = {
    jobs: [job],
    timer: setTimeout(() => flush(key), BUFFER_MS),
  };
  buffers.set(key, pending);
  console.log(`[buffer] start lead=${job.leadId} timer ${BUFFER_MS}ms`);
}

function flush(key: string): void {
  const pending = buffers.get(key);
  if (!pending) return;
  buffers.delete(key);

  const { jobs } = pending;
  if (jobs.length === 0) return;

  if (jobs.length === 1) {
    // Caso simples — só uma mensagem
    console.log(`[buffer] flush single lead=${jobs[0].leadId}`);
    enqueue(jobs[0]);
    return;
  }

  // Combina múltiplas mensagens em UM job
  // Mantém: agent/lead/channel/customer info do PRIMEIRO job
  // Combina conteúdo: concat com \n entre cada
  // messageId: do ÚLTIMO (mais recente) — pra dedup ainda funcionar
  const first = jobs[0];
  const last = jobs[jobs.length - 1];
  const combinedContent = jobs.map((j) => j.content).join('\n');

  console.log(
    `[buffer] flush combined lead=${first.leadId} jobs=${jobs.length} chars=${combinedContent.length}`,
  );

  enqueue({
    ...first,
    messageId: last.messageId, // dedup pelo último msgId
    content: combinedContent,
    enqueuedAt: Date.now(),
  });
}

/**
 * Estatísticas pra observabilidade.
 */
export function getBufferStats(): { active: number; totalPending: number } {
  let total = 0;
  for (const b of buffers.values()) total += b.jobs.length;
  return { active: buffers.size, totalPending: total };
}
