/**
 * Thribus Worker — Entry point
 *
 * Sobe um servidor Express que:
 *  1. Recebe webhooks do TexNet CRM (POST /webhook/texnet)
 *  2. Valida assinatura X-TexNet-Signature
 *  3. Deduplica por message_id
 *  4. Enfileira o job para o agent loop (ACK imediato ao CRM)
 *  5. Worker processa o loop assíncrono
 */

import express from 'express';
import { createWebhookRouter } from './crm/webhook.js';
import { startWorker } from './queue/index.js';
import { startPolling } from './agent/poll.js';

const PORT = Number(process.env.PORT ?? 3200);

const app = express();
app.use(express.json());

// Root — informativo
app.get('/', (_req, res) => {
  res.json({
    service: 'thribus-worker',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      webhook: 'POST /webhook/texnet',
    },
    ts: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Webhook routes
app.use('/webhook', createWebhookRouter());

// Start async worker loop
startWorker();

// Start polling (workaround enquanto webhook do TexNet está bugado)
startPolling();

app.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});
