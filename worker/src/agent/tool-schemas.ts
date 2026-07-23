/**
 * Schemas (input parameters) das tools — usados pra que o LLM saiba quais
 * argumentos passar quando chama uma tool.
 *
 * Antes ficavam vazios (`properties: {}`), o que fazia o LLM chamar tools
 * sem body — gerava erros silenciosos no n8n (ex: consultar_viabilidade
 * recebia `{}` em vez de `{ query: "..." }`).
 *
 * No futuro, ideal mover isso pra tabela `tools.parameters` (jsonb) no DB
 * e ler dinâmico. Por agora, hardcoded por tool name.
 */

import type { ToolDefinition } from '../llm/types.js';

type Properties = ToolDefinition['input_schema']['properties'];

interface SchemaSpec {
  properties: Properties;
  required?: string[];
}

const SCHEMAS: Record<string, SchemaSpec> = {
  consultar_viabilidade: {
    properties: {
      query: {
        type: 'string',
        description: 'Endereço completo em texto livre (rua, número, bairro, cidade, CEP).',
      },
    },
    required: ['query'],
  },

  consultar_cpf: {
    properties: {
      cpf: {
        type: 'string',
        description: 'CPF do cliente. Aceita com pontos/traço ou só números.',
      },
    },
    required: ['cpf'],
  },

  listar_planos: {
    // Sem parâmetros — retorna planos disponíveis
    properties: {},
  },

  cadastro_wizard: {
    properties: {
      cpf: { type: 'string', description: 'CPF do cliente — EXATAMENTE 11 dígitos numéricos que o cliente digitou no histórico. PROIBIDO: "00000000000", "11111111111" ou qualquer placeholder. Se cliente não passou CPF claro, NÃO chame esta tool — pergunte primeiro.' },
      nome: { type: 'string', description: 'Nome completo do cliente exatamente como ele digitou.' },
      email: { type: 'string', description: 'Email do cliente — formato a@b.c. Não inventar.' },
      celular: { type: 'string', description: 'Celular com DDD, só números (11 dígitos). Ex: "85997919198".' },
      cep: { type: 'string', description: 'CEP do endereço (só números, 8 dígitos). Ex: "60821795".' },
      rua: { type: 'string', description: 'Nome da rua/avenida exatamente como cliente passou.' },
      numero: { type: 'string', description: 'Número da residência. Ex: "650", "120B".' },
      bairro: { type: 'string', description: 'Bairro como cliente passou.' },
      complemento: { type: 'string', description: 'Complemento (opcional, só se cliente mencionou).' },
      data_nascimento: { type: 'string', description: 'Data de nascimento DD/MM/AAAA do cliente. Não inventar.' },
      tipo_cobranca: { type: 'string', description: 'Tipo de cobrança. Sempre passar "B" (boleto).' },
      dia_vencimento: { type: 'string', description: 'Dia do vencimento que cliente escolheu: "10" ou "15".' },
      canal_venda: { type: 'string', description: 'Canal da venda. Sempre passar "whatsapp".' },
      cliente_id_existente: { type: 'string', description: 'ID do cliente existente no IXC (se já cadastrado, opcional).' },
      plano_id: { type: 'string', description: 'OBRIGATÓRIO: o campo `id_ixc` (numérico) retornado por `listar_planos` desta sessão. Ex: "1393" (500MB) ou "1613" (700MB). PROIBIDO passar o NOME do plano (ex: "500 Mega Banda Larga"). PROIBIDO inventar números (ex: "1", "2", "100", "2001"). PROIBIDO usar índice da lista visual ("1️⃣"). Se não tem retorno do listar_planos, chame essa tool primeiro.' },
      valor_mensal: { type: 'string', description: 'OBRIGATÓRIO: o campo `preco` numérico do plano escolhido (de listar_planos). Formato decimal com ponto. Ex: "99.90", "119.90". Não inventar.' },
      cidade_id: { type: 'string', description: 'ID da cidade no IXC (opcional — default Fortaleza/948).' },
      uf_id: { type: 'string', description: 'ID da UF no IXC (opcional — default CE/11).' },
    },
    // plano_id e valor_mensal NÃO são required pra manter compat: conversas
    // em andamento na Bianca antiga ainda funcionam (n8n usa fallback).
    // Quando o prompt for atualizado pra orientar a Bianca a sempre passar,
    // efetivamente vão sempre vir preenchidos.
    required: ['cpf', 'nome', 'email', 'celular', 'cep', 'rua', 'numero', 'bairro', 'tipo_cobranca', 'dia_vencimento', 'canal_venda'],
  },

  status_contrato: {
    properties: {
      contrato_id: {
        type: 'string',
        description: 'ID numérico do contrato (NÃO o CPF). Ex: "92597".',
      },
    },
    required: ['contrato_id'],
  },

  consultar_agenda: {
    properties: {
      data_desejada: {
        type: 'string',
        description: 'Data no formato YYYY-MM-DD (ex: 2026-05-08).',
      },
    },
    required: ['data_desejada'],
  },

  criar_os_agendamento: {
    properties: {
      os_id: { type: 'string', description: 'ID da OS (do cadastro_wizard, NÃO o contrato_id).' },
      cliente_id: { type: 'string', description: 'ID do cliente no IXC.' },
      contrato_id: { type: 'string', description: 'ID do contrato no IXC.' },
      login: { type: 'string', description: 'Login do cliente (CPF só números).' },
      login_id: { type: 'string', description: 'ID do registro de login no IXC.' },
      data_reservada: { type: 'string', description: 'Data da instalação YYYY-MM-DD.' },
      periodo: { type: 'string', description: 'Período: "manha" ou "tarde".' },
    },
    required: ['os_id', 'cliente_id', 'contrato_id', 'data_reservada', 'periodo'],
  },

  // Tool de escalação humana (internal — handler em tools/internal.ts).
  // Usar SEMPRE que decidir passar a conversa pra um humano. NÃO basta
  // anunciar em texto — chamar a tool é o que efetivamente move o lead pra
  // fila aguardando, desvincula responsável e desativa o bot na conversa.
  escalar_humano: {
    properties: {
      motivo: {
        type: 'string',
        description:
          'Motivo curto e objetivo da escalação (1 frase). Vai pra nota interna ' +
          'pro time saber por que a conversa caiu na fila. Ex: "cliente quer ' +
          'condição especial — sem autonomia pra negociar", "viabilidade ' +
          'indisponível, validar manualmente", "cliente solicitou atendente humano".',
      },
    },
    required: ['motivo'],
  },

  // ─── Cliente (custom_attributes do contato no Talki) ─────────────────────────
  // Internal tools — handler em tools/internal.ts. Operam sobre o CONTATO dono
  // da conversa atual (o worker resolve o contato pelo conversation_id do
  // contexto). Por isso NÃO recebem id de contato/conversa como parâmetro.
  consultar_cliente: {
    // Sem parâmetros — lê os dados do contato da própria conversa.
    properties: {},
  },

  atualizar_cliente: {
    // Todos opcionais: passe SÓ os campos que quer gravar. Os demais são
    // preservados. Chaves fora desta lista são ignoradas.
    properties: {
      cpf: { type: 'string', description: 'CPF do cliente (com ou sem pontuação).' },
      profissao: { type: 'string', description: 'Profissão/ocupação do cliente.' },
      nome_pagador_pix: { type: 'string', description: 'Nome de quem paga via PIX (se diferente do cliente).' },
      cobranca_ativa: { type: 'boolean', description: 'Se a cobrança automática está ativa (true/false).' },
      tipo_contrato: { type: 'string', description: 'Tipo de contrato (valor da lista configurada no Talki).' },
      produto_nome: { type: 'string', description: 'Nome do produto/serviço contratado.' },
      valor_total_contrato: { type: 'string', description: 'Valor total do contrato. Decimal com ponto, ex: "1200.00".' },
      valor_parcela: { type: 'string', description: 'Valor de cada parcela. Decimal com ponto, ex: "100.00".' },
      periodicidade: { type: 'string', description: 'Periodicidade da cobrança (valor da lista, ex: "mensal", "semanal").' },
      proxima_data_vencimento: { type: 'string', description: 'Próximo vencimento no formato YYYY-MM-DD.' },
      chave_pix_cobranca: { type: 'string', description: 'Chave PIX usada na cobrança (valor da lista configurada).' },
      status_parcela: { type: 'string', description: 'Status da parcela atual (valor da lista, ex: "em_dia", "atrasada", "paga").' },
      data_ultimo_pagamento: { type: 'string', description: 'Data do último pagamento no formato YYYY-MM-DD.' },
      numero_parcelas_total: { type: 'string', description: 'Número total de parcelas do contrato. Ex: "12".' },
      parcela_atual: { type: 'string', description: 'Número da parcela atual/corrente. Ex: "3".' },
    },
  },

  // ─── Multi-agent routing (M2) ────────────────────────────────────────────────
  // Tool especial: NÃO chama endpoint HTTP — é tratada pelo dispatcher
  // como "internal tool" que muda conversation.agent_id no DB.
  // Usada quando o agente atual percebe que o cliente precisa de outra
  // especialidade (ex: Bianca-Vendas detecta problema técnico → transfere
  // pra Renata-Suporte).
  transferir_para_agente: {
    properties: {
      target_agent_role: {
        type: 'string',
        description:
          'Papel do agente destino: "sales", "support", "finance", "retention". ' +
          'O dispatcher resolve qual agent_id atende esse papel no workspace atual. ' +
          'Use o papel, NÃO um id específico — assim funciona em qualquer cliente.',
      },
      motivo: {
        type: 'string',
        description:
          'Motivo curto da transferência (1-2 frases). Vai pro histórico ' +
          'pra auditoria e contexto pro agente destino.',
      },
      mensagem_ao_cliente: {
        type: 'string',
        description:
          'Mensagem que será enviada ao cliente ANTES da transferência ocorrer. ' +
          'Ex: "Vou te passar pro time de suporte que vai te ajudar com isso. Um momento."',
      },
    },
    required: ['target_agent_role', 'motivo', 'mensagem_ao_cliente'],
  },
};

/**
 * Retorna o schema (input_schema) pra uma tool. Se a tool não está mapeada,
 * retorna properties vazias (compatibilidade — comportamento antigo).
 */
export function getToolInputSchema(toolName: string): ToolDefinition['input_schema'] {
  const spec = SCHEMAS[toolName];
  if (!spec) {
    return { type: 'object', properties: {} };
  }
  return {
    type: 'object',
    properties: spec.properties,
    required: spec.required,
  };
}
