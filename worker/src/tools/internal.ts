/**
 * Internal tools — tools tratadas DENTRO do worker, sem chamada HTTP.
 *
 * Algumas tools precisam mexer no estado da conversa (DB/CRM) e não fazem
 * sentido como HTTP endpoint externo. Este módulo registra os handlers
 * e o dispatcher delega pra cá quando reconhece o nome.
 *
 * Hoje:
 *  - transferir_para_agente (M2): muda conversation.agent_id pra outro
 *    agente do mesmo workspace
 *  - escalar_humano: marca a conversa pra handoff. O loop ao detectar o
 *    flag `escalated` no result chama `handoffToHuman` (nota interna +
 *    botMode=false + stage=aguardando + responsibleId=null).
 */

import { db, type AgentRole, type WorkspaceRecord } from '../db/index.js';
import * as talki from '../talki/client.js';
import type * as crm from '../crm/dispatcher.js';
import { consultarImoveisGorki } from './gorki-catalogo.js';

export interface InternalToolContext {
  conversationId: string;
  currentAgentId: string;
  workspaceId?: string;
  channel?: string;
  /** ID externo do lead no CRM (no Talki = conversation_id). */
  leadId?: string;
  /** Workspace da conversa — usado pra resolver config do CRM (Talki). */
  workspace?: WorkspaceRecord;
  /** Função pra mandar mensagem ao cliente via CRM dispatcher. */
  sendMessage?: (content: string) => Promise<void>;
}

/**
 * Atributos customizados de cliente/contrato/parcela que vivem no CONTATO do
 * Talki (conta do cliente). Whitelist única compartilhada por consultar_cliente
 * e atualizar_cliente — qualquer chave fora desta lista é rejeitada na escrita.
 */
export const CLIENTE_ATTR_KEYS = [
  'cpf',
  'profissao',
  'nome_pagador_pix',
  'cobranca_ativa',
  'tipo_contrato',
  'produto_nome',
  'valor_total_contrato',
  'valor_parcela',
  'periodicidade',
  'proxima_data_vencimento',
  'chave_pix_cobranca',
  'status_parcela',
  'data_ultimo_pagamento',
  'numero_parcelas_total',
  'parcela_atual',
] as const;

export interface InternalToolResult {
  output: string;
  /** Sinaliza ao loop que a conversa mudou de dono — interrompe o turno atual. */
  conversationTransferred?: { newAgentId: string; newAgentName: string };
  /** Sinaliza ao loop que o LLM pediu handoff humano — interrompe e escala. */
  escalated?: { motivo: string };
  error?: string;
}

/** Lista os nomes de tools tratadas internamente. */
export const INTERNAL_TOOL_NAMES = new Set<string>([
  'transferir_para_agente',
  'escalar_humano',
  'consultar_cliente',
  'atualizar_cliente',
  'consultar_imoveis_gorki',
]);

export function isInternalTool(name: string): boolean {
  return INTERNAL_TOOL_NAMES.has(name);
}

/**
 * Executa uma internal tool. O dispatcher deve chamar isso quando
 * `isInternalTool(name)` retorna true, em vez de fazer HTTP.
 */
export async function executeInternal(
  toolName: string,
  input: Record<string, unknown>,
  ctx: InternalToolContext,
): Promise<InternalToolResult> {
  switch (toolName) {
    case 'transferir_para_agente':
      return transferirParaAgente(input, ctx);
    case 'escalar_humano':
      return escalarHumano(input, ctx);
    case 'consultar_cliente':
      return consultarCliente(input, ctx);
    case 'atualizar_cliente':
      return atualizarCliente(input, ctx);
    case 'consultar_imoveis_gorki':
      return { output: JSON.stringify(await consultarImoveisGorki(input)) };
    default:
      return {
        output: JSON.stringify({ error: `Internal tool "${toolName}" não implementada.` }),
        error: 'not_implemented',
      };
  }
}

// ─── Implementações ──────────────────────────────────────────────────────────

async function transferirParaAgente(
  input: Record<string, unknown>,
  ctx: InternalToolContext,
): Promise<InternalToolResult> {
  const role = String(input.target_agent_role ?? '').toLowerCase().trim();
  const motivo = String(input.motivo ?? '').slice(0, 500);
  const mensagem = String(input.mensagem_ao_cliente ?? '').trim();

  if (!role) {
    return {
      output: JSON.stringify({
        sucesso: false,
        erro: 'target_agent_role é obrigatório (ex: "support", "finance").',
      }),
      error: 'invalid_role',
    };
  }

  if (!ctx.workspaceId) {
    return {
      output: JSON.stringify({
        sucesso: false,
        erro: 'Conversa sem workspace_id — transferência multi-agente requer workspace.',
      }),
      error: 'no_workspace',
    };
  }

  // Resolve role → agent_id no workspace
  const target = await db.agents.findByWorkspaceAndRole(ctx.workspaceId, role as AgentRole);
  if (!target) {
    return {
      output: JSON.stringify({
        sucesso: false,
        erro: `Nenhum agente com role="${role}" no workspace. Escale humano em vez de transferir.`,
        roles_disponiveis_dica: 'Verifique workspace.router_config ou agents.role no DB.',
      }),
      error: 'no_target_agent',
    };
  }

  if (target.id === ctx.currentAgentId) {
    return {
      output: JSON.stringify({
        sucesso: false,
        erro: 'Você JÁ é o agente desse role. Não há ninguém pra transferir.',
      }),
      error: 'self_transfer',
    };
  }

  // Manda mensagem ao cliente ANTES de transferir (a transferência interrompe o turno)
  if (mensagem && ctx.sendMessage) {
    try {
      await ctx.sendMessage(mensagem);
    } catch (err) {
      console.warn(`[transferir_para_agente] falha ao mandar msg ao cliente:`, (err as Error).message);
      // continua — a transferência ainda vale a pena mesmo sem msg
    }
  }

  // Atualiza conversation.agent_id + trilha
  await db.conversations.transferToAgent(
    ctx.conversationId,
    target.id,
    ctx.currentAgentId,
    motivo || `Transferido de ${ctx.currentAgentId} pra ${target.name}`,
  );

  console.log(
    `[transfer] conv=${ctx.conversationId} ${ctx.currentAgentId} → ${target.id} (${target.name}, role=${role}) motivo="${motivo}"`,
  );

  return {
    output: JSON.stringify({
      sucesso: true,
      novo_agente: { id: target.id, name: target.name, role },
      mensagem_enviada: !!mensagem,
      info_pro_llm:
        'Transferência concluída. Pare de responder agora — o próximo agente assume a conversa no próximo turno.',
    }),
    conversationTransferred: { newAgentId: target.id, newAgentName: target.name },
  };
}

/**
 * escalar_humano — sinaliza ao loop que o LLM decidiu passar pra humano.
 *
 * NÃO chama crm.escalateToHuman aqui — o loop centraliza o handoff via
 * `handoffToHuman` (nota interna + botMode=false + stage=aguardando +
 * responsibleId=null). Aqui só validamos o motivo e marcamos o flag.
 *
 * O LLM ainda recebe um output útil pra parar de gerar texto neste turno.
 */
async function escalarHumano(
  input: Record<string, unknown>,
  _ctx: InternalToolContext,
): Promise<InternalToolResult> {
  const motivo = String(input.motivo ?? '').trim().slice(0, 500) ||
    'Handoff solicitado pelo agente sem motivo explícito.';

  return {
    output: JSON.stringify({
      sucesso: true,
      info_pro_llm:
        'Handoff humano registrado. Pare de responder agora — a conversa foi passada pro time. Não envie mais mensagens neste turno.',
      motivo,
    }),
    escalated: { motivo },
  };
}

// ─── Cliente (custom_attributes do contato no Talki) ──────────────────────────

/**
 * Resolve a config do Talki + o contact_id a partir do contexto da conversa.
 * O worker identifica o lead pelo conversation_id (ctx.leadId no Talki); daqui
 * buscamos o contato dono da conversa pra ler/escrever seus custom_attributes.
 */
async function resolveTalkiContact(
  ctx: InternalToolContext,
): Promise<{ cfg: talki.TalkiConfig; contactId: number } | { error: string }> {
  const channel = ctx.channel ?? '';
  if (!channel.startsWith('talki:')) {
    return { error: `Tool disponível apenas em conversas Talki (channel atual: "${channel || 'desconhecido'}").` };
  }
  if (!ctx.leadId) {
    return { error: 'Conversa sem identificador de lead (conversation_id) — impossível resolver o contato.' };
  }

  const cfg = talki.configFromWorkspace(ctx.workspace);
  const conv = await talki.conversations.get(Number(ctx.leadId), cfg);
  const contactId = conv.contact?.id ?? conv.meta?.sender?.id;
  if (!contactId) {
    return { error: 'Não foi possível identificar o contato desta conversa no Talki.' };
  }
  return { cfg, contactId };
}

/** Extrai apenas as chaves conhecidas de um mapa de custom_attributes. */
function pickKnownAttrs(source: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const key of CLIENTE_ATTR_KEYS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = source[key];
    }
  }
  return out;
}

async function consultarCliente(
  _input: Record<string, unknown>,
  ctx: InternalToolContext,
): Promise<InternalToolResult> {
  const resolved = await resolveTalkiContact(ctx);
  if ('error' in resolved) {
    return { output: JSON.stringify({ sucesso: false, erro: resolved.error }), error: 'resolve_failed' };
  }

  try {
    const contact = await talki.contacts.get(resolved.contactId, resolved.cfg);
    const dados = pickKnownAttrs(contact.custom_attributes);
    return {
      output: JSON.stringify({
        sucesso: true,
        contact_id: resolved.contactId,
        nome: contact.name ?? null,
        dados_cliente: dados,
        info_pro_llm:
          Object.keys(dados).length === 0
            ? 'Nenhum dado de cliente/contrato cadastrado ainda neste contato. Colete com o cliente e use atualizar_cliente pra gravar.'
            : 'Dados atuais do cliente. Use como fonte de verdade — não invente valores que não estão aqui.',
      }),
    };
  } catch (err) {
    return {
      output: JSON.stringify({ sucesso: false, erro: `Falha ao consultar contato no Talki: ${(err as Error).message}` }),
      error: 'talki_get_failed',
    };
  }
}

async function atualizarCliente(
  input: Record<string, unknown>,
  ctx: InternalToolContext,
): Promise<InternalToolResult> {
  // 1. Filtra o input pra aceitar SÓ as chaves conhecidas (ignora o resto).
  const updates: Record<string, unknown> = {};
  const ignoradas: string[] = [];
  const knownSet = new Set<string>(CLIENTE_ATTR_KEYS);
  for (const [k, v] of Object.entries(input)) {
    if (!knownSet.has(k)) {
      ignoradas.push(k);
      continue;
    }
    if (v === undefined || v === null || v === '') continue;
    updates[k] = v;
  }

  if (Object.keys(updates).length === 0) {
    return {
      output: JSON.stringify({
        sucesso: false,
        erro: 'Nenhum atributo válido pra atualizar.',
        atributos_aceitos: CLIENTE_ATTR_KEYS,
        chaves_ignoradas: ignoradas,
      }),
      error: 'no_valid_attrs',
    };
  }

  const resolved = await resolveTalkiContact(ctx);
  if ('error' in resolved) {
    return { output: JSON.stringify({ sucesso: false, erro: resolved.error }), error: 'resolve_failed' };
  }

  try {
    // 2. Read-modify-write: o Chatwoot SUBSTITUI o jsonb inteiro no PUT, então
    //    lemos os atributos atuais e mesclamos as alterações por cima. Assim
    //    atualizar 1 campo não apaga os outros 14.
    const current = await talki.contacts.get(resolved.contactId, resolved.cfg);
    const merged = { ...(current.custom_attributes ?? {}), ...updates };

    const saved = await talki.contacts.updateCustomAttributes(resolved.contactId, merged, resolved.cfg);

    return {
      output: JSON.stringify({
        sucesso: true,
        contact_id: resolved.contactId,
        atualizados: Object.keys(updates),
        chaves_ignoradas: ignoradas.length ? ignoradas : undefined,
        dados_cliente: pickKnownAttrs(saved.custom_attributes ?? merged),
        info_pro_llm: 'Dados gravados no contato. Confirme ao cliente apenas o que foi efetivamente atualizado.',
      }),
    };
  } catch (err) {
    return {
      output: JSON.stringify({ sucesso: false, erro: `Falha ao atualizar contato no Talki: ${(err as Error).message}` }),
      error: 'talki_update_failed',
    };
  }
}

// crm import só pra fazer typeguard — não usado em runtime aqui
type _CrmAlias = typeof crm;
