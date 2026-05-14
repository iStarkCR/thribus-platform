/**
 * Tool "transferir_para_agente" — handoff entre agentes do Cortex.
 *
 * Toda definição de agente que tiver `autonomous=true` ganha essa tool
 * automaticamente. O agente pode chamar quando perceber que o assunto
 * mudou e outro especialista deve continuar.
 *
 * Exemplo de fluxo:
 *   user → Bianca (vendas) → tool transferir_para_agente(agent="marcos", reason="cliente quer negociar débito") → Marcos responde
 */

import type { ToolDefinition } from '../../../llm/types.js';

export const HANDOFF_TOOL_NAME = 'transferir_para_agente';

export function buildHandoffTool(availableAgents: { id: string; name: string; description: string }[]): ToolDefinition {
  const list = availableAgents.map((a) => `  - ${a.id} (${a.name}): ${a.description}`).join('\n');

  return {
    name: HANDOFF_TOOL_NAME,
    description: `Transfere a conversa para outro agente especialista quando o assunto sai do seu escopo.
Use SOMENTE quando o cliente precisa de outra especialidade. Não use por incerteza pequena.

Agentes disponíveis:
${list}`,
    input_schema: {
      type: 'object',
      properties: {
        target_agent_id: {
          type: 'string',
          description: 'ID do agente que vai continuar a conversa.',
        },
        reason: {
          type: 'string',
          description: 'Por que essa transferência (máx 200 chars).',
        },
        context_summary: {
          type: 'string',
          description: 'Resumo curto do que já foi tratado, pra o próximo agente entrar no contexto (máx 500 chars).',
        },
      },
      required: ['target_agent_id', 'reason'],
    },
  };
}
