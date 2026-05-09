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

import { db, type AgentRole } from '../db/index.js';
import type * as crm from '../crm/dispatcher.js';

export interface InternalToolContext {
  conversationId: string;
  currentAgentId: string;
  workspaceId?: string;
  channel?: string;
  /** Função pra mandar mensagem ao cliente via CRM dispatcher. */
  sendMessage?: (content: string) => Promise<void>;
}

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

// crm import só pra fazer typeguard — não usado em runtime aqui
type _CrmAlias = typeof crm;
