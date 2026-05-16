/**
 * Cortex M1 — Talki Runtime.
 *
 * CRUD de threads + messages. Suporte a @mention de agentes (aciona Brain
 * via /cortex/analyze internamente e posta resposta como mensagem do agente).
 *
 * Real-time pendente — V2 com Supabase Realtime ou WebSocket próprio. V1 é
 * polling-based (frontend chama GET /messages a cada 3s).
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import { agentRegistry } from '../agents/registry.js';
import { orchestrate } from '../brain/orchestrator.js';
import type { ModuleDefinition } from './types.js';

export const talkiRuntimeModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'talki',
  name: 'Talki',
  slug: 'talki',
  description: 'Chat colaborativo entre humanos e agentes IA. Threads, mensagens, mentions @agent integradas com o Brain.',
  category: 'comms',
  version: '0.2.0-beta',
  status: 'beta',
  icon: 'MessageSquare',
  tags: ['chat', 'colaboração', 'agentes'],
};

async function withTenant(req: Request, res: Response): Promise<{ tenantId: string; raw: string } | null> {
  const header = req.headers.authorization as string | undefined;
  const tenant = await authenticate(header);
  if (!tenant) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return { tenantId: tenant.tenantId, raw: header ?? '' };
}

function findMentions(body: string): string[] {
  const mentions: string[] = [];
  const re = /@(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const agent = agentRegistry.get(m[1].toLowerCase());
    if (agent) mentions.push(agent.id);
  }
  return mentions;
}

export function buildTalkiRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  // ─── Threads ──────────────────────────────────────────────────────────
  router.get('/threads', async (req: Request, res: Response) => {
    const ctx = await withTenant(req, res);
    if (!ctx) return;
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    const { data, error } = await supabase
      .from('cortex_talki_threads')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ threads: data });
  });

  router.post('/threads', async (req: Request, res: Response) => {
    const ctx = await withTenant(req, res);
    if (!ctx) return;
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    const body = req.body as { title?: string; kind?: 'direct' | 'group' | 'channel' };
    const { data, error } = await supabase
      .from('cortex_talki_threads')
      .insert({
        tenant_id: ctx.tenantId,
        title: body.title ?? null,
        kind: body.kind ?? 'channel',
      })
      .select()
      .maybeSingle();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ thread: data });
  });

  // ─── Messages ─────────────────────────────────────────────────────────
  router.get('/threads/:threadId/messages', async (req: Request, res: Response) => {
    const ctx = await withTenant(req, res);
    if (!ctx) return;
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    let q = supabase
      .from('cortex_talki_messages')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('thread_id', req.params.threadId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (since) q = q.gt('created_at', since);
    const { data, error } = await q;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ messages: data });
  });

  router.post('/threads/:threadId/messages', async (req: Request, res: Response) => {
    const ctx = await withTenant(req, res);
    if (!ctx) return;
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    const body = req.body as {
      body_md?: string;
      author_id?: string;
      attachments?: unknown[];
      reply_to?: number;
    };
    if (!body.body_md) {
      res.status(400).json({ error: 'body_md obrigatório' });
      return;
    }

    // Insere mensagem do user
    const { data: msg, error } = await supabase
      .from('cortex_talki_messages')
      .insert({
        thread_id: req.params.threadId,
        tenant_id: ctx.tenantId,
        author_id: body.author_id ?? null,
        body_md: body.body_md,
        attachments: body.attachments ?? [],
        reply_to: body.reply_to ?? null,
      })
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Detecta menções @agent e dispara Brain async
    const mentions = findMentions(body.body_md);
    if (mentions.length > 0) {
      for (const agentId of mentions) {
        void handleMention({
          tenantId: ctx.tenantId,
          threadId: req.params.threadId,
          agentId,
          inputText: body.body_md.replace(new RegExp(`@${agentId}`, 'gi'), '').trim(),
          authHeader: ctx.raw,
        }).catch(() => {
          // sem stop — log feito dentro do handler
        });
      }
    }

    res.status(201).json({ message: msg, mentions });
  });

  return router;
}

async function handleMention(input: {
  tenantId: string;
  threadId: string;
  agentId: string;
  inputText: string;
  authHeader: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    const result = await orchestrate(
      { tenantId: input.tenantId, tenantName: 'talki' },
      {
        sessionId: `talki:${input.threadId}`,
        input: input.inputText,
        channel: 'talki',
        hints: { forceAgent: input.agentId },
      },
      process.env.ANTHROPIC_API_KEY,
    );

    if (result.reply) {
      await supabase.from('cortex_talki_messages').insert({
        thread_id: input.threadId,
        tenant_id: input.tenantId,
        agent_id: input.agentId,
        body_md: result.reply,
        attachments: [],
      });
    }
  } catch (err) {
    console.warn('[talki.runtime] mention handler failed:', (err as Error).message);
  }
}
