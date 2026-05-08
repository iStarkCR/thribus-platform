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
      cpf: { type: 'string', description: 'CPF do cliente (só números, 11 dígitos).' },
      nome: { type: 'string', description: 'Nome completo do cliente.' },
      email: { type: 'string', description: 'Email do cliente.' },
      celular: { type: 'string', description: 'Celular com DDD (só números).' },
      cep: { type: 'string', description: 'CEP do endereço (só números, 8 dígitos).' },
      rua: { type: 'string', description: 'Nome da rua/avenida.' },
      numero: { type: 'string', description: 'Número da residência.' },
      bairro: { type: 'string', description: 'Bairro.' },
      complemento: { type: 'string', description: 'Complemento (opcional).' },
      data_nascimento: { type: 'string', description: 'Data de nascimento DD/MM/AAAA.' },
      tipo_cobranca: { type: 'string', description: 'Tipo de cobrança. Sempre "B" (boleto).' },
      dia_vencimento: { type: 'string', description: 'Dia do vencimento (10 ou 15).' },
      canal_venda: { type: 'string', description: 'Canal da venda. Sempre "whatsapp".' },
      cliente_id_existente: { type: 'string', description: 'ID do cliente existente no IXC (se já cadastrado, opcional).' },
      plano_id: { type: 'string', description: 'ID do plano escolhido pelo cliente (vem do listar_planos). Sem isso o IXC cadastra com plano errado.' },
      valor_mensal: { type: 'string', description: 'Valor mensal do plano em reais (ex: "99.90"). Vem do listar_planos. Sem isso o cliente_contrato fica com valor_unitario NULL.' },
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

  // Tool de escalação (quando existe explicitamente)
  escalar_humano: {
    properties: {
      motivo: {
        type: 'string',
        description: 'Motivo da escalação (curto). Ex: "cliente solicitou", "erro técnico repetido".',
      },
    },
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
