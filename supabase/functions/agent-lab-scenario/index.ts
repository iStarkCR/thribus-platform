/**
 * Edge Function: agent-lab-scenario
 *
 * Automatiza o padrão "canal de teste via API do Talki" (skill
 * talki-api-test-channel) dentro do Agent Lab: simula uma conversa COMPLETA
 * multi-turno com um agente, como se fosse o cliente real, SEM WhatsApp real e
 * SEM tocar o roteamento de produção de nenhum outro agente.
 *
 * Como funciona: o Talki (Chatwoot) tem inbox `Channel::Api`. Criar contato +
 * conversa + mensagens `incoming` via REST dispara o webhook `message_created`
 * da conta pro worker IGUAL um inbox real — o loop de produção roda inteiro
 * (tools reais, state machine, CRM), mas os side-effects ficam só na conversa
 * de teste, isolada. A resposta do bot aparece como mensagem `outgoing` na
 * mesma conversa — por isso o transcript coletado é o "histórico de testes".
 *
 * ⚠️ Pré-requisito pra o bot RESPONDER: a conta Talki precisa ter webhook
 * `message_created` apontando pro worker que atende aquele agente, e esse
 * worker precisa estar no ar. Sem isso, os `incoming` são criados mas nenhum
 * `outgoing` volta (nada escuta). Isso é config de infra/deploy (gate do Charles).
 *
 * Ações (body.action):
 *   start  { agent_id, warmup?: string[] }
 *          → garante roteamento (append talki:acc:inbox em agents.channels,
 *            NUNCA sobrescreve agents.channel) → cria contato + conversa de
 *            teste → aplica label se o workspace exigir → (warmup opcional) →
 *            { conversation_id, inbox_id, account_id, contact_id, channel,
 *              channel_appended, required_label, base }
 *   send   { agent_id, conversation_id, content }
 *          → cria 1 mensagem incoming (cliente simulado)
 *   poll   { agent_id, conversation_id }
 *          → { messages: [{ type, content, created_at }] }
 *   end    { agent_id, conversation_id?, channel }
 *          → remove o channel de teste de agents.channels (reverte o start) e
 *            resolve a conversa. NÃO limpa registros criados em CRM/IXC durante
 *            o teste (conhecido — ver skill).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * O token/base/conta do Talki vêm da linha do workspace do agente
 * (crm_base_url / crm_account_id / crm_api_token), via service role.
 *
 * Deploy: supabase functions deploy agent-lab-scenario
 */

// @ts-expect-error — Deno
import { serve } from 'https://deno.land/std@0.220.0/http/server.ts';
// @ts-expect-error
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// @ts-expect-error — Deno
const envv = (k: string) => Deno.env.get(k);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SUPABASE_URL = envv('SUPABASE_URL')!;
const SERVICE_ROLE = envv('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = envv('SUPABASE_ANON_KEY');

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

interface WorkspaceCfg {
  base: string; // ex https://talki.thribustech.com/api/v1/accounts/14
  accountId: string;
  token: string;
  requiredLabel: string | null;
}

interface AgentCtx {
  id: string;
  name: string;
  channel: string | null;
  channels: string[];
  ws: WorkspaceCfg;
}

/** Monta contexto do agente + config Talki do workspace (service role). */
async function loadCtx(agentId: string): Promise<AgentCtx> {
  const { data: agent, error: aerr } = await db
    .from('agents')
    .select('id, name, channel, channels, workspace_id')
    .eq('id', agentId)
    .maybeSingle();
  if (aerr) throw new Error(aerr.message);
  if (!agent) throw new Error(`Agent ${agentId} não encontrado`);
  if (!agent.workspace_id) throw new Error('Agente sem workspace');

  const { data: ws, error: werr } = await db
    .from('workspaces')
    .select('crm_provider, crm_base_url, crm_account_id, crm_api_token, talki_required_label')
    .eq('id', agent.workspace_id)
    .maybeSingle();
  if (werr) throw new Error(werr.message);
  if (!ws) throw new Error('Workspace não encontrado');
  if (ws.crm_provider !== 'talki') throw new Error(`Workspace não é Talki (crm_provider=${ws.crm_provider})`);
  if (!ws.crm_base_url || !ws.crm_account_id || !ws.crm_api_token) {
    throw new Error('Workspace sem config Talki completa (base_url/account_id/api_token)');
  }

  return {
    id: agent.id,
    name: agent.name,
    channel: agent.channel ?? null,
    channels: (agent.channels ?? []) as string[],
    ws: {
      base: `${ws.crm_base_url.replace(/\/+$/, '')}/api/v1/accounts/${ws.crm_account_id}`,
      accountId: String(ws.crm_account_id),
      token: ws.crm_api_token,
      requiredLabel: ws.talki_required_label || null,
    },
  };
}

function tk(ctx: AgentCtx): HeadersInit {
  return { api_access_token: ctx.ws.token, 'Content-Type': 'application/json' };
}

/** Acha um channel talki:{account}:{inbox} do agente que seja Channel::Api. */
async function resolveTestInbox(ctx: AgentCtx): Promise<{ channel: string; inboxId: string } | null> {
  const candidates = [ctx.channel, ...ctx.channels]
    .filter((c): c is string => !!c && c.startsWith(`talki:${ctx.ws.accountId}:`));
  for (const ch of candidates) {
    const inboxId = ch.split(':')[2];
    if (!inboxId) continue;
    const r = await fetch(`${ctx.ws.base}/inboxes/${inboxId}`, { headers: tk(ctx) });
    if (!r.ok) continue;
    const inbox = await r.json();
    if (inbox?.channel_type === 'Channel::Api') return { channel: ch, inboxId };
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Validação leve do chamador (dispara ações em prod Talki): exige user JWT.
  if (ANON_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data, error } = await sb.auth.getUser();
      if (error || !data?.user) return json({ error: 'unauthorized' }, 401);
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'json inválido' }, 400);
  }

  const action = body.action as string;
  const agentId = body.agent_id as string;
  if (!agentId) return json({ error: 'agent_id obrigatório' }, 400);

  try {
    const ctx = await loadCtx(agentId);

    if (action === 'start') {
      const resolved = await resolveTestInbox(ctx);
      if (!resolved) {
        return json({
          error:
            'Nenhum inbox Channel::Api de teste vinculado a este agente. Crie um inbox de teste ' +
            'no Talki (Channel::Api) e adicione talki:{conta}:{inbox} em channels do agente.',
        }, 412);
      }
      const { channel, inboxId } = resolved;

      // Roteia: append em channels (idempotente, NUNCA toca channel canônico).
      let channelAppended = false;
      if (ctx.channel !== channel && !ctx.channels.includes(channel)) {
        const next = [...ctx.channels, channel];
        const { error } = await db.from('agents').update({ channels: next }).eq('id', ctx.id);
        if (error) throw new Error(`falha ao rotear channel: ${error.message}`);
        channelAppended = true;
      }

      // Contato de teste (telefone único).
      const phone = `+5585${Date.now().toString().slice(-9)}`;
      const cRes = await fetch(`${ctx.ws.base}/contacts`, {
        method: 'POST',
        headers: tk(ctx),
        body: JSON.stringify({ inbox_id: Number(inboxId), name: 'Agent Lab — cliente simulado', phone_number: phone }),
      });
      if (!cRes.ok) throw new Error(`Talki contacts ${cRes.status}: ${(await cRes.text()).slice(0, 200)}`);
      const cData = await cRes.json();
      const contact = cData?.payload?.contact ?? cData?.payload ?? cData;
      const contactId = contact?.id;
      const sourceId =
        contact?.contact_inboxes?.[0]?.source_id ??
        cData?.payload?.contact_inbox?.source_id ??
        crypto.randomUUID();

      // Conversa.
      const convRes = await fetch(`${ctx.ws.base}/conversations`, {
        method: 'POST',
        headers: tk(ctx),
        body: JSON.stringify({ source_id: sourceId, inbox_id: Number(inboxId), contact_id: contactId, status: 'open' }),
      });
      if (!convRes.ok) throw new Error(`Talki conversations ${convRes.status}: ${(await convRes.text()).slice(0, 200)}`);
      const convData = await convRes.json();
      const conversationId = convData?.id ?? convData?.payload?.id;
      if (!conversationId) throw new Error('não consegui obter conversation_id do Talki');

      // Label obrigatória do workspace (gate de atendimento).
      if (ctx.ws.requiredLabel) {
        await fetch(`${ctx.ws.base}/conversations/${conversationId}/labels`, {
          method: 'POST',
          headers: tk(ctx),
          body: JSON.stringify({ labels: [ctx.ws.requiredLabel] }),
        }).catch(() => undefined);
      }

      // Warm-up opcional (destrava gate de silêncio TALKI_REQUIRE_CANAL_RESPONDIDO).
      const warmup = Array.isArray(body.warmup) ? (body.warmup as string[]) : [];
      for (const content of warmup) {
        await fetch(`${ctx.ws.base}/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: tk(ctx),
          body: JSON.stringify({ content, message_type: 'incoming' }),
        }).catch(() => undefined);
      }

      return json({
        conversation_id: conversationId,
        inbox_id: inboxId,
        account_id: ctx.ws.accountId,
        contact_id: contactId,
        channel,
        channel_appended: channelAppended,
        required_label: ctx.ws.requiredLabel,
        base: ctx.ws.base,
      });
    }

    if (action === 'send') {
      const conversationId = body.conversation_id;
      const content = (body.content as string ?? '').trim();
      if (!conversationId) return json({ error: 'conversation_id obrigatório' }, 400);
      if (!content) return json({ error: 'content obrigatório' }, 400);
      const r = await fetch(`${ctx.ws.base}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: tk(ctx),
        body: JSON.stringify({ content, message_type: 'incoming' }),
      });
      if (!r.ok) throw new Error(`Talki send ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return json({ ok: true });
    }

    if (action === 'poll') {
      const conversationId = body.conversation_id;
      if (!conversationId) return json({ error: 'conversation_id obrigatório' }, 400);
      const r = await fetch(`${ctx.ws.base}/conversations/${conversationId}/messages`, { headers: tk(ctx) });
      if (!r.ok) throw new Error(`Talki poll ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      const raw = Array.isArray(data?.payload) ? data.payload : Array.isArray(data) ? data : [];
      const TYPES: Record<number, string> = { 0: 'incoming', 1: 'outgoing', 2: 'activity', 3: 'template' };
      const messages = raw
        .map((m: Record<string, unknown>) => ({
          type: TYPES[m.message_type as number] ?? String(m.message_type),
          content: (m.content as string) ?? '',
          created_at: m.created_at,
        }))
        .filter((m: { type: string; content: string }) => m.content && m.type !== 'activity');
      return json({ messages });
    }

    if (action === 'end') {
      const channel = body.channel as string | undefined;
      if (channel && ctx.channels.includes(channel)) {
        const next = ctx.channels.filter((c) => c !== channel);
        await db.from('agents').update({ channels: next }).eq('id', ctx.id);
      }
      const conversationId = body.conversation_id;
      if (conversationId) {
        await fetch(`${ctx.ws.base}/conversations/${conversationId}/toggle_status`, {
          method: 'POST',
          headers: tk(ctx),
          body: JSON.stringify({ status: 'resolved' }),
        }).catch(() => undefined);
      }
      return json({ ok: true, channel_removed: !!(channel && ctx.channels.includes(channel)) });
    }

    return json({ error: `ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
