import type { Agent, Escalation, Execution, Tool } from '@/types';

export const SEED_AGENTS: Agent[] = [
  {
    id: 'texnet-n1',
    name: 'Suporte N1',
    client: 'Texnet',
    sector: 'ISP/Telecom',
    type: 'operacional',
    status: 'online',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `Você é o Colaborador Digital de Suporte N1 da Texnet, um provedor de internet. Seu objetivo é resolver problemas técnicos dos clientes de forma eficiente e empática.

IDENTIDADE:
- Você se chama "Suporte Texnet"
- Seja objetivo, claro e cordial
- Sempre confirme a identidade do cliente antes de executar ações

FLUXO PADRÃO:
1. Identifique o cliente pelo número de WhatsApp
2. Verifique status financeiro do contrato
3. Diagnostique o problema com as ferramentas disponíveis
4. Execute ações de resolução
5. Se não resolver, abra OS ou escale para humano

ESCALONAMENTO:
- Escale imediatamente se: cancelamento, reclamação grave, situação jurídica
- Escale após 3 tentativas sem resolução
- Sempre faça um resumo antes de escalar`,
    tools: [
      'consultar_cliente',
      'consultar_contrato',
      'consultar_os',
      'abrir_os',
      'consultar_onu',
      'reiniciar_onu',
      'consultar_acs',
      'escalar_humano',
    ],
    stats: { today: 184, resolution: 89, avgResponseTime: 1.8, escalated: 17 },
    createdAt: '2026-04-15T10:00:00Z',
    updatedAt: '2026-05-06T12:00:00Z',
  },
  {
    id: 'lifetime-agend',
    name: 'Agendamento',
    client: 'Clínica Lifetime',
    sector: 'Saúde',
    type: 'modular',
    status: 'online',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `Você é o Colaborador Digital de Agendamento da Clínica Lifetime. Seu objetivo é agendar consultas de forma rápida e acolhedora.

IDENTIDADE:
- Seja acolhedor e profissional
- Use linguagem acessível
- Confirme todos os dados antes de agendar

FLUXO:
1. Identifique o paciente
2. Entenda a necessidade (especialidade)
3. Consulte horários disponíveis
4. Confirme agendamento
5. Envie confirmação por WhatsApp`,
    tools: ['consultar_agenda', 'criar_agendamento', 'enviar_confirmacao', 'escalar_humano'],
    stats: { today: 63, resolution: 96, avgResponseTime: 1.1, escalated: 4 },
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-05-06T12:00:00Z',
  },
  {
    id: 'demo-vendas',
    name: 'Agente de Vendas',
    client: 'Demo',
    sector: 'Em configuração',
    type: 'modular',
    status: 'standby',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: '[Aguardando configuração]',
    tools: ['consultar_lead', 'mover_etapa', 'atualizar_lead', 'escalar_humano'],
    stats: { today: 0, resolution: 0, avgResponseTime: 0, escalated: 0 },
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
  },
];

export const SEED_TOOLS: Tool[] = [
  { id: 't1', name: 'consultar_cliente', description: 'Busca dados cadastrais do cliente pelo número ou CPF via API IXC.', endpoint: '/v1/cliente', method: 'GET', scope: 'Texnet', active: true },
  { id: 't2', name: 'consultar_contrato', description: 'Retorna plano ativo, status financeiro e data de vencimento.', endpoint: '/v1/contrato', method: 'GET', scope: 'Texnet', active: true },
  { id: 't3', name: 'consultar_os', description: 'Lista ordens de serviço abertas e histórico do cliente.', endpoint: '/v1/os', method: 'GET', scope: 'Texnet', active: true },
  { id: 't4', name: 'abrir_os', description: 'Abre ordem de serviço técnica com categoria, descrição e prioridade.', endpoint: '/v1/os', method: 'POST', scope: 'Texnet', active: true },
  { id: 't5', name: 'consultar_onu', description: 'Verifica status de sinal da ONU (OLT/PON), potência e uptime.', endpoint: 'IXC OLT API', method: 'GET', scope: 'Texnet', active: true },
  { id: 't6', name: 'reiniciar_onu', description: 'Executa reinício remoto da ONU do cliente via IXC.', endpoint: 'POST OLT reboot', method: 'POST', scope: 'Texnet', active: true },
  { id: 't7', name: 'consultar_acs', description: 'Verifica status TR-069/ACS do roteador, última comunicação e parâmetros.', endpoint: 'ACS API', method: 'GET', scope: 'Texnet', active: true },
  { id: 't8', name: 'consultar_agenda', description: 'Lista horários disponíveis por especialidade e médico.', endpoint: 'Agenda API', method: 'GET', scope: 'Lifetime', active: true },
  { id: 't9', name: 'criar_agendamento', description: 'Cria agendamento de consulta no sistema da clínica.', endpoint: 'POST Agenda', method: 'POST', scope: 'Lifetime', active: true },
  { id: 't10', name: 'enviar_confirmacao', description: 'Envia mensagem de confirmação via WhatsApp.', endpoint: 'Gupshup API', method: 'POST', scope: 'Lifetime', active: true },
  { id: 't11', name: 'escalar_humano', description: 'Desativa botMode e transfere o lead para atendente humano disponível no TexNet CRM.', endpoint: '/v1/leads/:id/bot-mode', method: 'PATCH', scope: 'Global', active: true },
  { id: 't12', name: 'consultar_lead', description: 'Busca dados completos do lead no TexNet CRM, incluindo histórico de mensagens e etapa do funil.', endpoint: '/v1/leads/:id', method: 'GET', scope: 'Global', active: true },
  { id: 't13', name: 'mover_etapa', description: 'Move o lead para uma etapa do funil (aguardando, em_atendimento, convertido, perdido, etc.).', endpoint: '/v1/leads/:id/stage', method: 'PATCH', scope: 'Global', active: true },
  { id: 't14', name: 'atualizar_lead', description: 'Atualiza campos do lead: nome, email, valor, notas, tags.', endpoint: '/v1/leads/:id', method: 'PATCH', scope: 'Global', active: true },
  { id: 't15', name: 'listar_agentes_online', description: 'Lista agentes humanos disponíveis (status online) no TexNet CRM para atribuição.', endpoint: '/v1/users', method: 'GET', scope: 'Global', active: true },
  { id: 't16', name: 'verificar_canal', description: 'Verifica se o canal WhatsApp está conectado antes de enviar mensagem.', endpoint: '/v1/whatsapp/channels', method: 'GET', scope: 'Global', active: true },
];

export const SEED_EXECUTIONS: Execution[] = [
  { id: 'e1', agentId: 'texnet-n1', agentName: 'Suporte N1', clientName: 'Texnet', customerName: 'João Ferreira', status: 'resolved', toolsUsed: ['consultar_cliente', 'consultar_onu', 'reiniciar_onu'], responseTime: 2.3, tokensUsed: 1240, cost: 0.002, timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
  { id: 'e2', agentId: 'texnet-n1', agentName: 'Suporte N1', clientName: 'Texnet', customerName: 'Sandra Rocha', status: 'escalated', toolsUsed: ['consultar_cliente', 'consultar_contrato', 'consultar_onu', 'reiniciar_onu', 'escalar_humano'], responseTime: 4.1, tokensUsed: 2810, cost: 0.004, timestamp: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: 'e3', agentId: 'lifetime-agend', agentName: 'Agendamento', clientName: 'Lifetime', customerName: 'Paula Menezes', status: 'resolved', toolsUsed: ['consultar_agenda', 'criar_agendamento'], responseTime: 1.2, tokensUsed: 890, cost: 0.001, timestamp: new Date(Date.now() - 14 * 60000).toISOString() },
  { id: 'e4', agentId: 'texnet-n1', agentName: 'Suporte N1', clientName: 'Texnet', customerName: 'Diego Alves', status: 'failed', toolsUsed: ['consultar_cliente'], responseTime: 0.8, tokensUsed: 320, cost: 0, timestamp: new Date(Date.now() - 27 * 60000).toISOString() },
  { id: 'e5', agentId: 'texnet-n1', agentName: 'Suporte N1', clientName: 'Texnet', customerName: 'Mariana Teixeira', status: 'resolved', toolsUsed: ['consultar_cliente', 'consultar_contrato', 'consultar_onu', 'reiniciar_onu'], responseTime: 3.6, tokensUsed: 2140, cost: 0.003, timestamp: new Date(Date.now() - 41 * 60000).toISOString() },
];

export const SEED_ESCALATIONS: Escalation[] = [
  { id: 'esc1', agentId: 'texnet-n1', agentName: 'Suporte N1', customerName: 'José Santos', reason: 'Problema persiste após reinício da ONU', waitTime: 4, priority: 'high', conversationId: 'conv-001', timestamp: new Date(Date.now() - 4 * 60000).toISOString() },
  { id: 'esc2', agentId: 'texnet-n1', agentName: 'Suporte N1', customerName: 'Maria Oliveira', reason: 'Solicitou cancelamento do contrato', waitTime: 11, priority: 'critical', conversationId: 'conv-002', timestamp: new Date(Date.now() - 11 * 60000).toISOString() },
  { id: 'esc3', agentId: 'lifetime-agend', agentName: 'Agendamento', customerName: 'Ana Costa', reason: 'Dúvida sobre convênio médico', waitTime: 18, priority: 'medium', conversationId: 'conv-003', timestamp: new Date(Date.now() - 18 * 60000).toISOString() },
  { id: 'esc4', agentId: 'texnet-n1', agentName: 'Suporte N1', customerName: 'Carlos Mendes', reason: 'Sem sinal após manutenção na região', waitTime: 32, priority: 'high', conversationId: 'conv-004', timestamp: new Date(Date.now() - 32 * 60000).toISOString() },
  { id: 'esc5', agentId: 'texnet-n1', agentName: 'Suporte N1', customerName: 'Fernanda Lima', reason: 'Cobrança indevida na fatura', waitTime: 45, priority: 'medium', conversationId: 'conv-005', timestamp: new Date(Date.now() - 45 * 60000).toISOString() },
  { id: 'esc6', agentId: 'texnet-n1', agentName: 'Suporte N1', customerName: 'Roberto Silva', reason: 'Lentidão intermitente sem causa aparente', waitTime: 62, priority: 'low', conversationId: 'conv-006', timestamp: new Date(Date.now() - 62 * 60000).toISOString() },
];
