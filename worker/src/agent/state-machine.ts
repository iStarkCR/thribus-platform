/**
 * State machine explícita pra agentes de venda.
 *
 * Motivação: LLMs (especialmente modelos pequenos) regridem de estado quando
 * histórico fica longo. Com state tracking explícito injetamos a posição
 * atual a cada turno, eliminando inferência.
 *
 * Cada estado tem:
 *   - description: o que o agente faz nesse estado
 *   - expectedTool: tool que ele DEVE chamar pra avançar (opcional)
 *   - nextState: pra onde ir depois da ação
 *   - allowedTools: subset de tools permitidas nesse estado (opcional, pra force-tool)
 *
 * O loop usa isso pra:
 *   1. Injetar contexto: "ESTADO ATUAL: X"
 *   2. Avançar estado quando tool específica é chamada
 *   3. Forçar tool específica quando anti-promise detecta promessa
 */

export interface StateDefinition {
  /** Identificador do estado, alinhado com o prompt */
  id: string;
  /** Descrição humana */
  description: string;
  /** Tool que avança o fluxo (opcional) */
  expectedTool?: string;
  /** Estado seguinte após sucesso da expectedTool */
  nextState?: string;
  /** Estados alternativos (ex: "sem_cobertura" se tool retornar negativo) */
  altTransitions?: Record<string, string>;
  /** Tools permitidas nesse estado — usado pelo force-tool (opcional) */
  allowedTools?: string[];
}

/**
 * Mapa de estados pra fluxos de venda ISP (Bianca).
 * Pode ser estendido por agente no futuro (cada agente referencia uma sm).
 */
export const SALES_FLOW_STATES: Record<string, StateDefinition> = {
  '1_welcome': {
    id: '1_welcome',
    description:
      'Boas-vindas. Agente se apresenta como Bianca consultora da Texnet e pergunta como pode ajudar.',
    nextState: '2_qualifying',
  },
  '2_qualifying': {
    id: '2_qualifying',
    description:
      'Pergunta se cliente é novo ou existente. Se existente, chama consultar_cpf. Se novo, vai pra coleta de endereço.',
    altTransitions: {
      cliente_existente: '2_qualifying', // pode chamar consultar_cpf aqui
      cliente_novo: '3_address',
    },
  },
  '3_address': {
    id: '3_address',
    description:
      'Solicita endereço completo (rua, número, bairro, CEP) para verificar viabilidade.',
    nextState: '4_viability',
  },
  '4_viability': {
    id: '4_viability',
    description:
      'Recebeu endereço. PRÓXIMA AÇÃO OBRIGATÓRIA: chamar consultar_viabilidade IMEDIATAMENTE com o endereço.',
    expectedTool: 'consultar_viabilidade',
    nextState: '5_plans',
    altTransitions: {
      sem_cobertura: 'sem_cobertura',
    },
    allowedTools: ['consultar_viabilidade'],
  },
  '5_plans': {
    id: '5_plans',
    description:
      'Cobertura confirmada. Pergunta uso (trabalho/jogos/estudos), depois quantas pessoas, depois chama listar_planos e apresenta opções.',
    expectedTool: 'listar_planos',
    nextState: '6_terms',
  },
  '6_terms': {
    id: '6_terms',
    description:
      'Cliente escolheu plano. Envia regras de contratação. Aguarda aceitação explícita dos termos.',
    nextState: '7_data_collection',
  },
  '7_data_collection': {
    id: '7_data_collection',
    description:
      'Cliente aceitou termos. Solicita CPF (se ainda não tem) e depois nome, nascimento, email, celular, dia_vencimento. NÃO pede endereço — já tem do Estado 3. Confirma todos os dados antes de avançar.',
    nextState: '8_registering',
  },
  '8_registering': {
    id: '8_registering',
    description:
      'Dados confirmados. PRÓXIMA AÇÃO OBRIGATÓRIA: chamar cadastro_wizard com TODOS os dados (cpf, nome, email, celular, cep, rua, numero, bairro, data_nascimento, tipo_cobranca:"B", dia_vencimento, canal_venda:"whatsapp").',
    expectedTool: 'cadastro_wizard',
    nextState: '9_signature_check',
    allowedTools: ['cadastro_wizard'],
  },
  '9_signature_check': {
    id: '9_signature_check',
    description:
      'Cadastro feito, contrato_id obtido. Aguarda cliente avisar que assinou. Quando avisar, chama status_contrato com o contrato_id da sessão.',
    expectedTool: 'status_contrato',
    nextState: '10_scheduling',
    altTransitions: {
      ainda_nao_assinado: '9_signature_check',
    },
    allowedTools: ['status_contrato'],
  },
  '10_scheduling': {
    id: '10_scheduling',
    description:
      'Contrato assinado. Pergunta data desejada. Chama consultar_agenda. Apresenta data disponível e pergunta período. Após confirmação, chama criar_os_agendamento.',
    expectedTool: 'criar_os_agendamento',
    nextState: '11_completed',
    allowedTools: ['consultar_agenda', 'criar_os_agendamento'],
  },
  '11_completed': {
    id: '11_completed',
    description:
      'Agendamento confirmado. Envia resumo final com dados reais e finaliza atendimento.',
  },
  // Estados terminais
  sem_cobertura: {
    id: 'sem_cobertura',
    description: 'Encerrado: endereço sem cobertura. Cliente foi orientado e atendimento finalizado.',
  },
  escalated: {
    id: 'escalated',
    description: 'Atendimento passado para o time humano.',
  },
};

/**
 * Estados terminais — ao alcançar, o atendimento é considerado encerrado.
 * Worker faz cleanup do histórico do DB local (CRM mantém o registro).
 */
export const TERMINAL_STATES = new Set([
  '11_completed',
  'sem_cobertura',
  'escalated',
]);

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Verifica qual estado deve seguir após uma tool ser chamada com sucesso.
 *
 * Ex: tool="consultar_viabilidade" + result indica COBERTURA DISPONÍVEL → "5_plans"
 *     tool="consultar_viabilidade" + result indica SEM COBERTURA → "sem_cobertura"
 *     tool="cadastro_wizard" + sucesso=true → "9_signature_check"
 */
export function nextStateAfterTool(
  currentState: string,
  toolName: string,
  toolOutput: string,
): string | null {
  const state = SALES_FLOW_STATES[currentState];
  if (!state) return null;

  // Se a tool é a expectedTool e tem next, transiciona
  if (state.expectedTool === toolName && state.nextState) {
    // Casos especiais — analisa output pra decidir transição alternativa
    const lower = toolOutput.toLowerCase();

    if (toolName === 'consultar_viabilidade') {
      if (lower.includes('sem cobertura')) return 'sem_cobertura';
      if (lower.includes('cobertura disponível') || lower.includes('cobertura disponivel')) {
        return state.nextState;
      }
    }

    if (toolName === 'status_contrato') {
      if (lower.includes('"contrato_ativo":false') || lower.includes('contrato_ativo: false')) {
        return '9_signature_check'; // permanece esperando
      }
    }

    if (toolName === 'cadastro_wizard') {
      if (lower.includes('"sucesso":false') || lower.includes('"sucesso": false')) {
        return currentState; // permanece em 8_registering pra retentar
      }
    }

    return state.nextState;
  }

  return null;
}

/**
 * Constrói o system reminder injetado a cada turno.
 * Inclui o estado atual + descrição + ação esperada.
 */
export function buildStateReminder(
  currentState: string,
  stateData: Record<string, unknown> = {},
): string {
  const state = SALES_FLOW_STATES[currentState];
  if (!state) {
    return `ESTADO ATUAL: desconhecido (${currentState}). Continue conforme o prompt.`;
  }

  const lines: string[] = [
    `═══════════ CONTEXTO INTERNO (não exibir ao cliente) ═══════════`,
    `ESTADO ATUAL: ${state.id}`,
    `O QUE FAZER: ${state.description}`,
  ];

  if (state.expectedTool) {
    lines.push(`PRÓXIMA AÇÃO: chame a tool \`${state.expectedTool}\``);
  }

  // Snapshot dos dados já coletados — ajuda LLM a não pedir de novo
  if (Object.keys(stateData).length > 0) {
    lines.push(``);
    lines.push(`DADOS JÁ COLETADOS NA CONVERSA:`);
    for (const [k, v] of Object.entries(stateData)) {
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      lines.push(`  • ${k}: ${value}`);
    }
    lines.push(``);
    lines.push(`NUNCA peça novamente nada que já está em DADOS JÁ COLETADOS.`);
  }

  lines.push(`═════════════════════════════════════════════════════════════════`);

  return lines.join('\n');
}

/**
 * Quando avança de estado, normalmente a LLM precisa salvar dados extraídos
 * da última interação. Esta função inspeciona tool outputs conhecidos
 * e extrai automaticamente.
 */
export function extractStateData(
  toolName: string,
  toolOutput: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (toolName === 'consultar_viabilidade') {
    const lower = toolOutput.toLowerCase();
    data.cobertura_ok =
      lower.includes('cobertura disponível') || lower.includes('cobertura disponivel');
  }

  if (toolName === 'consultar_cpf') {
    try {
      const json = JSON.parse(toolOutput) as { existe?: boolean; cliente_id?: number; nome?: string };
      data.cpf_existe = json.existe;
      if (json.cliente_id) data.cliente_id_existente = json.cliente_id;
      if (json.nome) data.nome_cpf = json.nome;
    } catch {
      // ignore
    }
  }

  if (toolName === 'cadastro_wizard') {
    try {
      const json = JSON.parse(toolOutput) as {
        sucesso?: boolean;
        wizard_cliente_id?: number;
        wizard_contrato_id?: number;
        wizard_login?: string;
        wizard_login_id?: number;
        wizard_os_id?: number;
      };
      if (json.sucesso) {
        data.cadastro_realizado = true;
        data.wizard_cliente_id = json.wizard_cliente_id;
        data.wizard_contrato_id = json.wizard_contrato_id;
        data.wizard_login = json.wizard_login;
        data.wizard_login_id = json.wizard_login_id;
        data.wizard_os_id = json.wizard_os_id;
      }
    } catch {
      // ignore
    }
  }

  if (toolName === 'consultar_agenda') {
    try {
      const json = JSON.parse(toolOutput) as { sucesso?: boolean; data_disponivel?: string };
      if (json.sucesso && json.data_disponivel) {
        data.data_instalacao_disponivel = json.data_disponivel;
      }
    } catch {
      // ignore
    }
  }

  if (toolName === 'criar_os_agendamento') {
    try {
      const json = JSON.parse(toolOutput) as { sucesso?: boolean };
      if (json.sucesso) {
        data.agendamento_confirmado = true;
      }
    } catch {
      // ignore
    }
  }

  return data;
}
