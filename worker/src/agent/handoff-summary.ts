/**
 * Gera o resumo do atendimento pra deixar como nota interna ao escalar
 * pra humano. Usa state_data + último estado + tools chamadas pra
 * montar um texto compacto e útil pro agente humano.
 */

import { SALES_FLOW_STATES } from './state-machine.js';

export interface HandoffSummaryInput {
  agentName: string;        // ex: "Bianca"
  customerName?: string;
  customerPhone?: string;
  currentState: string;     // ex: "10_scheduling"
  stateData: Record<string, unknown>;
  toolsUsed: string[];
  lastAgentReply?: string;
  reason?: string;          // ex: "erro_tecnico", "cliente_pediu_humano"
}

const FIELD_LABELS: Record<string, string> = {
  endereco: '📍 Endereço',
  cep: '📮 CEP',
  cobertura_ok: '🌐 Cobertura',
  uso: '🎯 Uso',
  pessoas: '👥 Pessoas na casa',
  plano_escolhido: '📦 Plano escolhido',
  termos_aceitos: '✅ Termos aceitos',
  cpf: '📄 CPF',
  cpf_existe: '🔎 CPF já cadastrado',
  cliente_id_existente: '🆔 Cliente IXC existente',
  nome: '👤 Nome',
  data_nascimento: '🎂 Nascimento',
  email: '📧 Email',
  celular: '📱 Celular',
  dia_vencimento: '💰 Dia vencimento',
  cadastro_realizado: '✅ Cadastro feito',
  wizard_cliente_id: '🆔 Cliente ID (IXC)',
  wizard_contrato_id: '📋 Contrato ID',
  wizard_login: '🔑 Login',
  wizard_login_id: '🔑 Login ID',
  wizard_os_id: '📝 OS ID',
  data_instalacao_disponivel: '📅 Data de instalação',
  agendamento_confirmado: '✅ Agendamento OK',
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function buildHandoffSummary(input: HandoffSummaryInput): string {
  const lines: string[] = [];
  lines.push(`🤖 *Atendimento ${input.agentName} — Resumo*`);
  lines.push('');

  if (input.customerName) lines.push(`Cliente: ${input.customerName}`);
  if (input.customerPhone) lines.push(`Telefone: ${input.customerPhone}`);

  // Última etapa
  const stateDef = SALES_FLOW_STATES[input.currentState];
  const stateLabel = stateDef ? stateDef.description.split('.')[0] : input.currentState;
  lines.push(`Última etapa: *${input.currentState}* — ${stateLabel}`);

  // Motivo de escalação
  if (input.reason) lines.push(`Motivo: ${input.reason}`);

  lines.push('');

  // Dados coletados
  const dataKeys = Object.keys(input.stateData);
  if (dataKeys.length > 0) {
    lines.push('*Dados coletados durante a conversa:*');
    for (const k of dataKeys) {
      const label = FIELD_LABELS[k] ?? k;
      const value = formatValue(input.stateData[k]);
      lines.push(`• ${label}: ${value}`);
    }
    lines.push('');
  }

  // Tools chamadas
  if (input.toolsUsed.length > 0) {
    const uniqueTools = [...new Set(input.toolsUsed)];
    lines.push(`*Ações executadas:* ${uniqueTools.join(', ')}`);
    lines.push('');
  }

  // Última fala
  if (input.lastAgentReply) {
    const truncated =
      input.lastAgentReply.length > 200
        ? input.lastAgentReply.slice(0, 200) + '...'
        : input.lastAgentReply;
    lines.push('*Última resposta da Bianca ao cliente:*');
    lines.push(`> ${truncated.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('_Bot encerrou — atendimento humano em andamento._');

  return lines.join('\n');
}
