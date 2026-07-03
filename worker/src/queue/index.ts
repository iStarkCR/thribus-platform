/**
 * Queue layer — in-memory com concorrência limitada
 *
 * MVP: array em memória + polling.
 * Produção: troque por BullMQ (Redis) ou pg-boss (Postgres).
 */

import { runAgentLoop } from '../agent/loop.js';
import { runCortexAgent } from '../agent/cortex-runner.js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AgentJob {
  agentId: string;
  leadId: string;              // ID do lead no TexNet CRM
  messageId: string;           // ID da mensagem (dedup)
  customerPhone: string;
  customerName?: string;
  content: string;
  messageType: string;         // text, image, audio, etc.
  channel: string;             // texnet-testeti, texnet-duall, etc.
  leadStage: string;
  enqueuedAt?: number;
}

// ─── Estado interno ───────────────────────────────────────────────────────────

const queue: AgentJob[] = [];
let running = 0;
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY ?? 5);

// ─── API pública ──────────────────────────────────────────────────────────────

export function enqueue(job: AgentJob): void {
  queue.push({ ...job, enqueuedAt: Date.now() });
  console.log(`[queue] enqueued agentId=${job.agentId} leadId=${job.leadId} msgId=${job.messageId} queueSize=${queue.length}`);
  drain();
}

export function startWorker(): void {
  console.log('[queue] worker started');
  setInterval(drain, 500);
}

// ─── Processamento ────────────────────────────────────────────────────────────

function drain(): void {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    runJob(job).finally(() => {
      running--;
      drain();
    });
  }
}

async function runJob(job: AgentJob): Promise<void> {
  const waitMs = Date.now() - (job.enqueuedAt ?? Date.now());
  console.log(`[queue] processing agentId=${job.agentId} leadId=${job.leadId} waited=${waitMs}ms`);
  try {
    // Ramificação do motor por canal (allowlist). Só os canais listados em
    // CORTEX_ENGINE_CHANNELS (ex: inbox Talki Teste) rodam no motor livre
    // (bianca-v2 via cortex-runner). TODO o resto — incluindo a Bianca prod —
    // segue no runAgentLoop, comportamento idêntico ao de hoje.
    const cortexChannels = (process.env.CORTEX_ENGINE_CHANNELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (cortexChannels.includes(job.channel)) {
      await runCortexAgent(job);
    } else {
      await runAgentLoop(job);
    }
  } catch (err) {
    console.error(`[queue] job failed agentId=${job.agentId} leadId=${job.leadId}`, err);
  }
}
