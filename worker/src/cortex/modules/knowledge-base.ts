/**
 * Cortex M2 — Módulo Knowledge Base.
 *
 * Folders + Docs com versionamento + tags. Visibility (private/team/public).
 * Vetorização: já existe pgvector — disparada em background quando doc é
 * criado/editado (futuro: hook no after-update).
 */

import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { authenticate } from '../inject/auth.js';
import { semanticMemory } from '../memory/semantic.js';
import type { ModuleDefinition } from './types.js';

export const kbModule: Omit<ModuleDefinition, 'buildRouter'> = {
  id: 'kb',
  name: 'Knowledge Base',
  slug: 'knowledge-base',
  description: 'Base de conhecimento com folders, docs versionados, search semântico via pgvector. Alimenta automaticamente o RAG dos agentes.',
  category: 'ops',
  version: '0.1.0',
  status: 'beta',
  icon: 'BookOpen',
  tags: ['docs', 'wiki', 'rag', 'knowledge'],
};

async function tid(req: Request, res: Response): Promise<string | null> {
  const t = await authenticate(req.headers.authorization as string | undefined);
  if (!t) return void res.status(401).json({ error: 'unauthorized' }), null;
  return t.tenantId;
}

function sb(res: Response): boolean {
  if (!supabase) return void res.status(503).json({ error: 'supabase not configured' }), false;
  return true;
}

export function buildKbRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '2mb' }));

  // ─── Folders ──────────────────────────────────────────────────────────
  router.get('/folders', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { data } = await supabase!.from('cortex_kb_folders').select('*').eq('tenant_id', tenantId).order('name');
    res.json({ folders: data });
  });

  router.post('/folders', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as { name?: string; parent_id?: string; icon?: string; visibility?: 'private' | 'team' | 'public' };
    if (!body.name) return void res.status(400).json({ error: 'name obrigatório' });
    const { data, error } = await supabase!.from('cortex_kb_folders').insert({
      tenant_id: tenantId,
      name: body.name,
      parent_id: body.parent_id ?? null,
      icon: body.icon ?? null,
      visibility: body.visibility ?? 'team',
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    res.status(201).json({ folder: data });
  });

  // ─── Docs ─────────────────────────────────────────────────────────────
  router.get('/docs', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const folderId = typeof req.query.folder_id === 'string' ? req.query.folder_id : undefined;
    let q = supabase!.from('cortex_kb_docs').select('id, title, folder_id, tags, version, visibility, view_count, last_edited_at, created_at').eq('tenant_id', tenantId).order('last_edited_at', { ascending: false }).limit(200);
    if (folderId) q = q.eq('folder_id', folderId);
    const { data } = await q;
    res.json({ docs: data });
  });

  router.get('/docs/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { data: doc } = await supabase!.from('cortex_kb_docs').select('*').eq('tenant_id', tenantId).eq('id', req.params.id).maybeSingle();
    if (!doc) return void res.status(404).json({ error: 'not_found' });
    // Incrementa view_count fire-and-forget
    void supabase!.from('cortex_kb_docs').update({ view_count: (doc.view_count as number) + 1 }).eq('id', doc.id);
    res.json({ doc });
  });

  router.post('/docs', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const body = req.body as { title?: string; body_md?: string; folder_id?: string; tags?: string[]; visibility?: 'private' | 'team' | 'public' };
    if (!body.title) return void res.status(400).json({ error: 'title obrigatório' });
    const { data, error } = await supabase!.from('cortex_kb_docs').insert({
      tenant_id: tenantId,
      title: body.title,
      body_md: body.body_md ?? '',
      folder_id: body.folder_id ?? null,
      tags: body.tags ?? [],
      visibility: body.visibility ?? 'team',
    }).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    // Vetoriza no RAG fire-and-forget
    if (body.body_md && body.body_md.length > 50) {
      void semanticMemory.addKnowledge(tenantId, {
        title: body.title,
        text: body.body_md,
        source: 'kb',
        sourceId: data?.id as string,
        tags: body.tags,
      });
    }
    res.status(201).json({ doc: data });
  });

  router.patch('/docs/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    // Buscar versão atual pra criar histórico
    const { data: current } = await supabase!.from('cortex_kb_docs').select('version, body_md').eq('tenant_id', tenantId).eq('id', req.params.id).maybeSingle();
    if (!current) return void res.status(404).json({ error: 'not_found' });

    const allowed = ['title', 'body_md', 'folder_id', 'tags', 'visibility'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    patch.version = (current.version as number) + 1;
    patch.last_edited_at = new Date().toISOString();

    // Salva versão anterior antes de atualizar
    if (patch.body_md && patch.body_md !== current.body_md) {
      await supabase!.from('cortex_kb_doc_versions').insert({
        doc_id: req.params.id,
        tenant_id: tenantId,
        version: current.version,
        body_md: current.body_md,
      });
    }

    const { data, error } = await supabase!.from('cortex_kb_docs').update(patch).eq('tenant_id', tenantId).eq('id', req.params.id).select().maybeSingle();
    if (error) return void res.status(400).json({ error: error.message });
    res.json({ doc: data });
  });

  router.delete('/docs/:id', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { error } = await supabase!.from('cortex_kb_docs').delete().eq('tenant_id', tenantId).eq('id', req.params.id);
    if (error) return void res.status(400).json({ error: error.message });
    res.status(204).end();
  });

  router.get('/docs/:id/versions', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId || !sb(res)) return;
    const { data } = await supabase!.from('cortex_kb_doc_versions').select('version, edited_at, edited_by').eq('tenant_id', tenantId).eq('doc_id', req.params.id).order('version', { ascending: false });
    res.json({ versions: data });
  });

  // Search semântico (já tem pgvector)
  router.get('/search', async (req: Request, res: Response) => {
    const tenantId = await tid(req, res);
    if (!tenantId) return;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q) return void res.status(400).json({ error: 'q obrigatório' });
    const hits = await semanticMemory.searchKnowledge(tenantId, q, 10);
    res.json({ hits });
  });

  return router;
}
