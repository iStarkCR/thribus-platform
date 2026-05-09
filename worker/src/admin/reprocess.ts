/**
 * Admin endpoint pra reprocessar leads que ficaram sem resposta.
 *
 * Caso de uso: worker fica fora do ar por algum motivo (erro de auth,
 * deploy travado, etc) e o TexNet entrega webhook → falha → desiste após
 * 3 retries. Mensagem do cliente fica pendente sem o worker saber.
 *
 * Esse endpoint busca um lead via TexNet API, pega a última msg inbound
 * de texto, e enfileira como se fosse webhook recém-chegado.
 *
 * Auth: header `X-Admin-Secret` deve bater com env `ADMIN_SECRET`.
 * Se ADMIN_SECRET não estiver definido, endpoint retorna 503 (desabilitado).
 *
 * Uso:
 *   curl -X POST https://<worker-url>/admin/reprocess-lead \
 *     -H "X-Admin-Secret: <secret>" \
 *     -H "Content-Type: application/json" \
 *     -d '{ "leadId": "uuid", "channel": "texnet-duall" }'
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import * as crm from '../crm/dispatcher.js';
import * as texnet from '../crm/client.js';
import { bufferEnqueue } from '../agent/buffer.js';
import { db } from '../db/index.js';

interface ReprocessRequest {
  leadId?: string;
  /** Alternativa a leadId — passa o telefone e o worker resolve o leadId via TexNet */
  phone?: string;
  channel?: string;
}

export function createAdminRouter(): Router {
  const router = Router();

  router.post(
    '/reprocess-lead',
    express.json(),
    async (req: Request, res: Response) => {
      // ─── Auth ───────────────────────────────────────────────────────────
      const adminSecret = process.env.ADMIN_SECRET;
      if (!adminSecret) {
        res.status(503).json({ error: 'admin endpoints disabled — set ADMIN_SECRET env' });
        return;
      }
      const provided = req.headers['x-admin-secret'];
      if (provided !== adminSecret) {
        res.status(401).json({ error: 'invalid admin secret' });
        return;
      }

      // ─── Validação do payload ──────────────────────────────────────────
      const body = req.body as ReprocessRequest;
      if (!body.channel) {
        res.status(400).json({ error: 'channel obrigatório' });
        return;
      }
      if (!body.leadId && !body.phone) {
        res.status(400).json({ error: 'leadId ou phone obrigatório' });
        return;
      }

      console.log(`[admin] reprocess-lead requested leadId=${body.leadId ?? '-'} phone=${body.phone ?? '-'} channel=${body.channel}`);

      try {
        // ─── Resolve agent + workspace pelo channel ────────────────────────
        const agent = await db.agents.findByChannel(body.channel);
        if (!agent) {
          res.status(404).json({ error: `nenhum agent associado ao channel ${body.channel}` });
          return;
        }
        const workspace = agent.workspaceId
          ? await db.workspaces.findById(agent.workspaceId).catch(() => null)
          : null;

        // ─── Resolve leadId via phone se necessário ────────────────────────
        let resolvedLeadId = body.leadId;
        if (!resolvedLeadId && body.phone) {
          const cfg = texnet.configFromWorkspace(workspace ?? undefined);
          // Sanitiza phone (remove não-dígitos, garante DDI 55)
          const digits = body.phone.replace(/\D/g, '');
          const normalized = digits.startsWith('55') ? digits : `55${digits}`;
          const candidates = await texnet.leads.list(
            { search: normalized, channel: body.channel, limit: 5 },
            cfg,
          );
          // Match exato pra evitar pegar lead errado em caso de ambiguidade
          const exact = candidates.find((l) => l.phone === normalized);
          if (!exact) {
            res.status(404).json({
              error: `nenhum lead com phone ${normalized} no channel ${body.channel}`,
              tried: candidates.map((l) => ({ id: l.id, phone: l.phone, name: l.name })),
            });
            return;
          }
          resolvedLeadId = exact.id;
        }

        // ─── Busca lead atualizado com mensagens via TexNet ────────────────
        const fullLead = await crm.getLead(body.channel, resolvedLeadId!, workspace ?? undefined);

        // ─── Pega última mensagem inbound de texto ─────────────────────────
        const inboundMessages = (fullLead.messages ?? [])
          .filter((m) => m.direction === 'inbound' && m.type === 'text' && m.content?.trim())
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (inboundMessages.length === 0) {
          res.status(404).json({ error: 'lead sem mensagem inbound de texto pra reprocessar' });
          return;
        }

        const latest = inboundMessages[inboundMessages.length - 1];

        // ─── Verifica se já foi processada ─────────────────────────────────
        const exists = await db.messages.exists(latest.id);
        if (exists) {
          res.status(409).json({
            error: 'última mensagem já existe no banco — já foi processada',
            messageId: latest.id,
          });
          return;
        }

        // ─── Enfileira ────────────────────────────────────────────────────
        bufferEnqueue({
          agentId: agent.id,
          leadId: fullLead.id,
          messageId: latest.id,
          customerPhone: fullLead.phone,
          customerName: fullLead.name,
          content: latest.content,
          messageType: latest.type,
          channel: fullLead.channel ?? body.channel,
          leadStage: fullLead.stage,
        });

        console.log(`[admin] reprocess-lead enqueued leadId=${fullLead.id} msgId=${latest.id}`);
        res.json({
          enqueued: true,
          leadId: fullLead.id,
          messageId: latest.id,
          content: latest.content.slice(0, 100),
          customer: fullLead.name,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[admin] reprocess-lead error: ${message}`);
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
