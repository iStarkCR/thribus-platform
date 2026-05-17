/**
 * Seed mock — Orquestração multi-agente (Fase 3).
 *
 * Router rules (intent → agent), workflows declarativos (gatilho → ação),
 * traces de decisão (árvore de tool calls), handoffs entre agentes.
 */

export interface RouterRule {
  id: string;
  workspaceId: string;
  name: string;
  intent: string;
  matcher: string;
  targetAgentId: string;
  targetAgentName: string;
  priority: number;
  enabled: boolean;
  hits30d: number;
  precision: number;
}

export type WorkflowTriggerType =
  | 'sla_breach'
  | 'message_received'
  | 'tool_failed'
  | 'sentiment_negative'
  | 'silent_lead'
  | 'tag_added';

export type WorkflowActionType =
  | 'escalate'
  | 'notify_slack'
  | 'send_email'
  | 'reassign_agent'
  | 'create_task'
  | 'tag';

export interface WorkflowStep {
  id: string;
  action: WorkflowActionType;
  config: Record<string, string | number>;
}

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  trigger: WorkflowTriggerType;
  triggerConfig: Record<string, string | number>;
  steps: WorkflowStep[];
  enabled: boolean;
  runs30d: number;
  successRate: number;
  lastRunAt?: string;
}

export interface AgentHandoff {
  id: string;
  conversationId: string;
  customerName: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  reason: string;
  contextPreserved: boolean;
  timestamp: string;
}

export interface DecisionTraceStep {
  id: string;
  step: number;
  type: 'thought' | 'tool_call' | 'tool_result' | 'response' | 'handoff';
  label: string;
  detail: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface DecisionTrace {
  id: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  userQuery: string;
  finalAnswer: string;
  steps: DecisionTraceStep[];
  totalLatencyMs: number;
  totalTokens: number;
  status: 'resolved' | 'escalated' | 'failed';
  timestamp: string;
}

export const SEED_ROUTER_RULES: RouterRule[] = [
  { id: 'rr_1', workspaceId: 'ws_texnet', name: 'Vendas → Bianca', intent: 'sales', matcher: 'contém: contratar, plano, internet, fibra, preço, valor, mensalidade', targetAgentId: 'agent_bianca', targetAgentName: 'Bianca (Vendas)', priority: 10, enabled: true, hits30d: 4_812, precision: 0.94 },
  { id: 'rr_2', workspaceId: 'ws_texnet', name: 'Suporte → Renata', intent: 'support', matcher: 'contém: lento, caiu, sem internet, não conecta, wifi, erro', targetAgentId: 'agent_renata', targetAgentName: 'Renata (Suporte N1)', priority: 9, enabled: true, hits30d: 8_211, precision: 0.91 },
  { id: 'rr_3', workspaceId: 'ws_texnet', name: 'Cobrança → Marcos', intent: 'finance', matcher: 'contém: boleto, pagamento, segunda via, débito, multa, atraso', targetAgentId: 'agent_marcos', targetAgentName: 'Marcos (Financeiro)', priority: 9, enabled: true, hits30d: 2_104, precision: 0.96 },
  { id: 'rr_4', workspaceId: 'ws_texnet', name: 'Retenção → Carla', intent: 'retention', matcher: 'contém: cancelar, sair, desistir, concorrente, péssimo, não quero mais', targetAgentId: 'agent_carla', targetAgentName: 'Carla (Retenção)', priority: 10, enabled: true, hits30d: 318, precision: 0.88 },
  { id: 'rr_5', workspaceId: 'ws_texnet', name: 'Fallback → Bianca', intent: 'fallback', matcher: 'sem match em outras intents', targetAgentId: 'agent_bianca', targetAgentName: 'Bianca (Vendas)', priority: 1, enabled: true, hits30d: 412, precision: 0.62 },
];

export const SEED_WORKFLOWS: Workflow[] = [
  {
    id: 'wf_1',
    workspaceId: 'ws_texnet',
    name: 'SLA > 2h sem resposta humana → escalar gerente',
    description: 'Se uma escalação humana fica sem ser pega em 2h, notifica gerente via Slack e cria task no ClickUp.',
    trigger: 'sla_breach',
    triggerConfig: { window_minutes: 120, status: 'escalated' },
    steps: [
      { id: 'st_1', action: 'notify_slack', config: { channel: '#atendimento-criticos', message: 'Escalação parada há 2h+ — {customer_name}' } },
      { id: 'st_2', action: 'create_task', config: { project: 'TexNet — Atendimento', assignee: 'gerente@texnet.com.br' } },
      { id: 'st_3', action: 'tag', config: { tag: 'sla-breach' } },
    ],
    enabled: true,
    runs30d: 42,
    successRate: 0.97,
    lastRunAt: '2026-05-16T09:42:00Z',
  },
  {
    id: 'wf_2',
    workspaceId: 'ws_texnet',
    name: 'Sentimento negativo → Carla (retenção)',
    description: 'Se sentiment score < -0.4 durante a conversa, reatribui pra Carla com contexto.',
    trigger: 'sentiment_negative',
    triggerConfig: { threshold: -0.4, min_messages: 3 },
    steps: [
      { id: 'st_4', action: 'reassign_agent', config: { agent_id: 'agent_carla', preserve_context: 1 } },
      { id: 'st_5', action: 'notify_slack', config: { channel: '#retencao', message: 'Cliente {customer_name} entrou em retenção automática' } },
    ],
    enabled: true,
    runs30d: 18,
    successRate: 0.83,
    lastRunAt: '2026-05-15T17:11:00Z',
  },
  {
    id: 'wf_3',
    workspaceId: 'ws_texnet',
    name: 'Lead silencioso 24h → follow-up automático',
    description: 'Lead que não respondeu última msg do bot em 24h recebe follow-up + tag.',
    trigger: 'silent_lead',
    triggerConfig: { hours: 24, max_followups: 2 },
    steps: [
      { id: 'st_6', action: 'send_email', config: { template: 'followup-vendas-1' } },
      { id: 'st_7', action: 'tag', config: { tag: 'follow-up-enviado' } },
    ],
    enabled: true,
    runs30d: 218,
    successRate: 0.41,
    lastRunAt: '2026-05-16T08:00:00Z',
  },
  {
    id: 'wf_4',
    workspaceId: 'ws_texnet',
    name: 'Tool falhou 3x → escalar humano',
    description: 'Se mesma tool falha 3 vezes na conversa, escala pra humano antes de frustrar o cliente.',
    trigger: 'tool_failed',
    triggerConfig: { max_failures: 3, window_minutes: 10 },
    steps: [
      { id: 'st_8', action: 'escalate', config: { priority: 'medium', reason: 'Tool falhando recorrentemente' } },
    ],
    enabled: true,
    runs30d: 9,
    successRate: 1.0,
    lastRunAt: '2026-05-14T14:22:00Z',
  },
  {
    id: 'wf_5',
    workspaceId: 'ws_texnet',
    name: 'Tag "vip" adicionada → notificar conta',
    description: 'Conta marcada como VIP no CRM dispara notificação ao gerente de contas.',
    trigger: 'tag_added',
    triggerConfig: { tag: 'vip' },
    steps: [
      { id: 'st_9', action: 'notify_slack', config: { channel: '#contas-vip', message: 'Novo VIP: {customer_name}' } },
    ],
    enabled: false,
    runs30d: 0,
    successRate: 0,
  },
];

export const SEED_HANDOFFS: AgentHandoff[] = [
  { id: 'hf_1', conversationId: 'cnv_98231', customerName: 'Maria Aparecida', fromAgentId: 'agent_bianca', fromAgentName: 'Bianca', toAgentId: 'agent_renata', toAgentName: 'Renata', reason: 'Cliente reclamou de lentidão durante a venda — passou pra suporte resolver primeiro.', contextPreserved: true, timestamp: '2026-05-16T11:30:00Z' },
  { id: 'hf_2', conversationId: 'cnv_98112', customerName: 'José Carlos', fromAgentId: 'agent_renata', fromAgentName: 'Renata', toAgentId: 'agent_marcos', toAgentName: 'Marcos', reason: 'Internet caiu por falta de pagamento — handoff pra financeiro tratar boleto.', contextPreserved: true, timestamp: '2026-05-16T10:14:00Z' },
  { id: 'hf_3', conversationId: 'cnv_97890', customerName: 'Aline Souza', fromAgentId: 'agent_bianca', fromAgentName: 'Bianca', toAgentId: 'agent_carla', toAgentName: 'Carla', reason: 'Cliente sinalizou cancelamento durante upgrade — Carla assumiu.', contextPreserved: true, timestamp: '2026-05-16T09:22:00Z' },
  { id: 'hf_4', conversationId: 'cnv_97740', customerName: 'Roberto Lima', fromAgentId: 'agent_renata', fromAgentName: 'Renata', toAgentId: 'agent_marcos', toAgentName: 'Marcos', reason: 'Cobrança duplicada — Renata sem permissão pra estornar.', contextPreserved: false, timestamp: '2026-05-15T16:48:00Z' },
];

export const SEED_TRACES: DecisionTrace[] = [
  {
    id: 'tr_1',
    conversationId: 'cnv_98231',
    agentId: 'agent_bianca',
    agentName: 'Bianca',
    userQuery: 'queria saber se vocês atendem na rua do progresso, 412 — bairro centro de Bagé',
    finalAnswer: 'Sim, Maria! Atendemos sua rua com fibra. Tenho plano de 600 mega por R$ 99,90/mês, primeiros 3 meses por R$ 79,90. Posso reservar instalação ainda essa semana?',
    steps: [
      { id: 'tr1_s1', step: 1, type: 'thought', label: 'Identifiquei intenção de vendas + endereço', detail: 'Cliente pergunta sobre cobertura. Preciso consultar viabilidade antes de oferecer plano.', durationMs: 220 },
      { id: 'tr1_s2', step: 2, type: 'tool_call', label: 'consultar_viabilidade', detail: '{ "endereco": "Rua do Progresso, 412 — Centro, Bagé/RS" }', durationMs: 1_412 },
      { id: 'tr1_s3', step: 3, type: 'tool_result', label: 'viável (fibra)', detail: '{ "status": "viavel", "tecnologia": "fibra", "velocidade_max_mbps": 1000 }', durationMs: 0 },
      { id: 'tr1_s4', step: 4, type: 'tool_call', label: 'rag.query (Planos TexNet)', detail: '{ "query": "plano 600 mega PF promoção", "top_k": 4 }', durationMs: 118 },
      { id: 'tr1_s5', step: 5, type: 'tool_result', label: '4 chunks recuperados', detail: 'Planos: FIBRA-600 R$ 99,90 + promo 3m R$ 79,90', durationMs: 0 },
      { id: 'tr1_s6', step: 6, type: 'response', label: 'Resposta gerada', detail: 'Confirmação de cobertura + oferta de plano + CTA de instalação', durationMs: 920, tokensUsed: 248 },
    ],
    totalLatencyMs: 2_670,
    totalTokens: 248,
    status: 'resolved',
    timestamp: '2026-05-16T11:41:30Z',
  },
  {
    id: 'tr_2',
    conversationId: 'cnv_98199',
    agentId: 'agent_renata',
    agentName: 'Renata',
    userQuery: 'minha internet tá horrível desde ontem, alguém pode resolver?',
    finalAnswer: 'Identifiquei oscilação na sua região. Já agendei visita técnica pra amanhã 14h. Pode confirmar?',
    steps: [
      { id: 'tr2_s1', step: 1, type: 'thought', label: 'Reclamação de qualidade — verificar status técnico', detail: 'Antes de pedir reset, vou ver se já tem incidente aberto na região.', durationMs: 180 },
      { id: 'tr2_s2', step: 2, type: 'tool_call', label: 'ixc_consulta_cliente', detail: '{ "telefone": "+5553..." }', durationMs: 612 },
      { id: 'tr2_s3', step: 3, type: 'tool_call', label: 'ixc_incidentes_regiao', detail: '{ "cidade": "Bagé", "bairro": "Centro" }', durationMs: 412 },
      { id: 'tr2_s4', step: 4, type: 'tool_result', label: 'Incidente ativo desde 21h ontem', detail: '{ "incidente_id": 4421, "status": "em_resolucao", "afetados": 128 }', durationMs: 0 },
      { id: 'tr2_s5', step: 5, type: 'tool_call', label: 'texnet_agendar_visita_tecnica', detail: '{ "cliente_id": 48211, "data": "2026-05-17T17:00Z" }', durationMs: 821 },
      { id: 'tr2_s6', step: 6, type: 'response', label: 'Resposta com agendamento', detail: 'Empatia + agendamento + pedido de confirmação', durationMs: 740, tokensUsed: 312 },
    ],
    totalLatencyMs: 2_765,
    totalTokens: 312,
    status: 'resolved',
    timestamp: '2026-05-16T10:11:00Z',
  },
];
