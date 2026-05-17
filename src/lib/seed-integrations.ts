/**
 * Seed mock — Tool Integrations (Fase 2).
 *
 * Catálogo de integrações prontas + custom tools + fila de aprovação
 * pra ações destrutivas. Cada integração agrupa N tools que o agente
 * pode chamar quando habilitada num workspace.
 */

export type IntegrationCategory =
  | 'crm'
  | 'erp'
  | 'comms'
  | 'payments'
  | 'productivity'
  | 'analytics'
  | 'custom';

export type IntegrationStatus =
  | 'available'
  | 'connected'
  | 'degraded'
  | 'deprecated';

export interface Integration {
  id: string;
  name: string;
  vendor: string;
  category: IntegrationCategory;
  description: string;
  logoEmoji: string;
  status: IntegrationStatus;
  toolCount: number;
  connectedWorkspaces: number;
  authType: 'oauth' | 'apikey' | 'basic' | 'token';
  destructive: boolean;
  popular?: boolean;
  docsUrl?: string;
  installCount: number;
}

export type ToolExecutionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface ToolApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  toolName: string;
  integrationId: string;
  payload: Record<string, unknown>;
  reason: string;
  status: ToolExecutionStatus;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
}

export interface CustomToolDef {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  schema: string;
  destructive: boolean;
  createdAt: string;
  invocations30d: number;
  errorRate: number;
}

export const SEED_INTEGRATIONS: Integration[] = [
  { id: 'int_hubspot', name: 'HubSpot', vendor: 'HubSpot Inc', category: 'crm', description: 'Sync contatos, deals e tickets. 14 tools (criar lead, mover deal, log atividade...).', logoEmoji: '🟧', status: 'connected', toolCount: 14, connectedWorkspaces: 3, authType: 'oauth', destructive: true, popular: true, docsUrl: 'https://developers.hubspot.com', installCount: 28 },
  { id: 'int_ixc', name: 'IXC Provedor', vendor: 'IXC Soft', category: 'erp', description: 'ERP de ISPs — consulta cliente, contratos, faturas, abre OS. 22 tools.', logoEmoji: '🟦', status: 'connected', toolCount: 22, connectedWorkspaces: 2, authType: 'token', destructive: true, popular: true, installCount: 14 },
  { id: 'int_stripe', name: 'Stripe', vendor: 'Stripe', category: 'payments', description: 'Cobrança, refunds, subscriptions, customer portal. 11 tools.', logoEmoji: '🟪', status: 'connected', toolCount: 11, connectedWorkspaces: 1, authType: 'apikey', destructive: true, popular: true, installCount: 19 },
  { id: 'int_slack', name: 'Slack', vendor: 'Salesforce', category: 'comms', description: 'Enviar msg, criar canal, abrir thread, postar arquivo. 8 tools.', logoEmoji: '🟫', status: 'connected', toolCount: 8, connectedWorkspaces: 4, authType: 'oauth', destructive: false, popular: true, installCount: 41 },
  { id: 'int_sheets', name: 'Google Sheets', vendor: 'Google', category: 'productivity', description: 'Ler, append, atualizar células, criar planilha. 6 tools.', logoEmoji: '🟢', status: 'connected', toolCount: 6, connectedWorkspaces: 5, authType: 'oauth', destructive: false, popular: true, installCount: 52 },
  { id: 'int_gmail', name: 'Gmail', vendor: 'Google', category: 'comms', description: 'Enviar email, ler thread, marcar lido, label. 7 tools.', logoEmoji: '✉️', status: 'available', toolCount: 7, connectedWorkspaces: 0, authType: 'oauth', destructive: false, installCount: 33 },
  { id: 'int_360dialog', name: '360dialog WhatsApp', vendor: '360dialog', category: 'comms', description: 'WhatsApp Business API — enviar template, mídia, ler status. 9 tools.', logoEmoji: '🟢', status: 'connected', toolCount: 9, connectedWorkspaces: 2, authType: 'apikey', destructive: false, installCount: 11 },
  { id: 'int_geogrid', name: 'Geogrid', vendor: 'Geogrid', category: 'analytics', description: 'Consulta de viabilidade técnica por endereço — área de cobertura ISP. 3 tools.', logoEmoji: '🗺️', status: 'connected', toolCount: 3, connectedWorkspaces: 1, authType: 'apikey', destructive: false, installCount: 4 },
  { id: 'int_pipedrive', name: 'Pipedrive', vendor: 'Pipedrive', category: 'crm', description: 'CRM alternativo ao HubSpot. Deal stages, persons, activities. 12 tools.', logoEmoji: '🟩', status: 'available', toolCount: 12, connectedWorkspaces: 0, authType: 'oauth', destructive: true, installCount: 7 },
  { id: 'int_pagarme', name: 'Pagar.me', vendor: 'Stone', category: 'payments', description: 'Adquirência BR — cobrança PIX, boleto, cartão, antecipação. 13 tools.', logoEmoji: '💳', status: 'available', toolCount: 13, connectedWorkspaces: 0, authType: 'apikey', destructive: true, installCount: 6 },
  { id: 'int_asaas', name: 'Asaas', vendor: 'Asaas', category: 'payments', description: 'Gateway BR completo — PIX (instantâneo + QR), boleto, cartão, assinaturas recorrentes, link de pagamento, antecipação. Ideal pra cliente final BR (PF/PJ). 16 tools.', logoEmoji: '🟢', status: 'connected', toolCount: 16, connectedWorkspaces: 4, authType: 'apikey', destructive: true, popular: true, docsUrl: 'https://docs.asaas.com', installCount: 24 },
  { id: 'int_mercadopago', name: 'Mercado Pago', vendor: 'MercadoLibre', category: 'payments', description: 'Gateway BR com maior capilaridade — PIX, boleto, cartão, parcelamento sem juros, checkout transparente. 14 tools.', logoEmoji: '💛', status: 'available', toolCount: 14, connectedWorkspaces: 0, authType: 'oauth', destructive: true, popular: true, installCount: 11 },
  { id: 'int_iugu', name: 'Iugu', vendor: 'Iugu', category: 'payments', description: 'Foco em recorrência BR — assinaturas, dunning (cobrança automática de inadimplentes), split de pagamento, marketplace. 12 tools.', logoEmoji: '🔵', status: 'available', toolCount: 12, connectedWorkspaces: 0, authType: 'apikey', destructive: true, installCount: 8 },
  { id: 'int_efi', name: 'Efí (Gerencianet)', vendor: 'Efí Bank', category: 'payments', description: 'Banking + PIX nativo — emissão direta como instituição financeira BC, sem intermediário. Taxa mais baixa. 9 tools.', logoEmoji: '🟠', status: 'available', toolCount: 9, connectedWorkspaces: 0, authType: 'apikey', destructive: true, installCount: 5 },
  { id: 'int_cobrefacil', name: 'Cobre Fácil', vendor: 'Cobre Fácil', category: 'payments', description: 'Cobrança simples BR — boleto + PIX, ideal pra pequenas operações. 8 tools.', logoEmoji: '🟤', status: 'available', toolCount: 8, connectedWorkspaces: 0, authType: 'apikey', destructive: true, installCount: 2 },
  { id: 'int_amplitude', name: 'Amplitude', vendor: 'Amplitude', category: 'analytics', description: 'Track event, criar cohort, pull insight. 5 tools.', logoEmoji: '📊', status: 'available', toolCount: 5, connectedWorkspaces: 0, authType: 'apikey', destructive: false, installCount: 9 },
  { id: 'int_clickup', name: 'ClickUp', vendor: 'ClickUp', category: 'productivity', description: 'Criar task, mover status, comentar, atribuir. 10 tools.', logoEmoji: '🟣', status: 'available', toolCount: 10, connectedWorkspaces: 0, authType: 'apikey', destructive: false, installCount: 12 },
  { id: 'int_chatwoot', name: 'Chatwoot / Talki', vendor: 'Chatwoot', category: 'comms', description: 'CRM de atendimento — manda msg pro lead, troca label, escala humano. 11 tools.', logoEmoji: '🟦', status: 'connected', toolCount: 11, connectedWorkspaces: 3, authType: 'token', destructive: false, popular: true, installCount: 22 },
  { id: 'int_zoho', name: 'Zoho CRM', vendor: 'Zoho', category: 'crm', description: 'CRM corporativo — leads, deals, contas. 15 tools.', logoEmoji: '🟥', status: 'available', toolCount: 15, connectedWorkspaces: 0, authType: 'oauth', destructive: true, installCount: 3 },
  { id: 'int_notion', name: 'Notion', vendor: 'Notion Labs', category: 'productivity', description: 'Ler page, criar database row, append block. 6 tools.', logoEmoji: '⬛', status: 'available', toolCount: 6, connectedWorkspaces: 0, authType: 'oauth', destructive: false, installCount: 18 },
  { id: 'int_supabase', name: 'Supabase', vendor: 'Supabase', category: 'productivity', description: 'Query SQL controlada, RPC, storage. 5 tools.', logoEmoji: '🟢', status: 'connected', toolCount: 5, connectedWorkspaces: 6, authType: 'apikey', destructive: true, installCount: 31 },
];

export const SEED_APPROVALS: ToolApprovalRequest[] = [
  {
    id: 'apr_1',
    agentId: 'agent_bianca',
    agentName: 'Bianca',
    toolName: 'stripe_refund',
    integrationId: 'int_stripe',
    payload: { charge_id: 'ch_3PqW...J9', amount: 19990, reason: 'cliente cancelou no prazo de arrependimento' },
    reason: 'Cliente solicitou reembolso de fidelidade dentro de 7 dias da contratação. Política autoriza.',
    status: 'pending',
    requestedAt: '2026-05-16T11:48:00Z',
  },
  {
    id: 'apr_2',
    agentId: 'agent_marcos',
    agentName: 'Marcos',
    toolName: 'ixc_cancelar_contrato',
    integrationId: 'int_ixc',
    payload: { contrato_id: 48211, motivo: 'cliente faleceu' },
    reason: 'Familiar enviou certidão por foto. Cancelamento por falecimento — isento de multa.',
    status: 'pending',
    requestedAt: '2026-05-16T11:21:00Z',
  },
  {
    id: 'apr_3',
    agentId: 'agent_bianca',
    agentName: 'Bianca',
    toolName: 'hubspot_delete_contact',
    integrationId: 'int_hubspot',
    payload: { contact_id: 'c_88421', cascade: true },
    reason: 'Pedido LGPD de exclusão — direito ao esquecimento.',
    status: 'approved',
    requestedAt: '2026-05-16T08:12:00Z',
    reviewedAt: '2026-05-16T08:40:00Z',
    reviewedBy: 'Charles Andrade',
    notes: 'Confirmado por email do titular. Procedimento LGPD OK.',
  },
  {
    id: 'apr_4',
    agentId: 'agent_renata',
    agentName: 'Renata',
    toolName: 'ixc_alterar_plano',
    integrationId: 'int_ixc',
    payload: { contrato_id: 48109, plano_novo: 'FIBRA-600-FIDELIDADE' },
    reason: 'Cliente pediu upgrade. Plano novo > plano atual.',
    status: 'rejected',
    requestedAt: '2026-05-15T16:02:00Z',
    reviewedAt: '2026-05-15T18:15:00Z',
    reviewedBy: 'Marcia Lopes',
    notes: 'Cliente ainda em período de fidelidade do plano antigo. Comercial precisa fazer migração manual.',
  },
  {
    id: 'apr_5',
    agentId: 'agent_bianca',
    agentName: 'Bianca',
    toolName: 'stripe_create_subscription',
    integrationId: 'int_stripe',
    payload: { customer: 'cus_3K...mZ', price: 'price_FIBRA600', trial_days: 0 },
    reason: 'Cliente confirmou contratação via WhatsApp + assinou termo digital.',
    status: 'executed',
    requestedAt: '2026-05-15T14:30:00Z',
    reviewedAt: '2026-05-15T14:33:00Z',
    reviewedBy: 'Auto-approve',
    notes: 'Aprovação automática — valor abaixo do threshold de R$ 500.',
  },
];

export const SEED_CUSTOM_TOOLS: CustomToolDef[] = [
  {
    id: 'ct_1',
    workspaceId: 'ws_texnet',
    name: 'texnet_consulta_os_aberta',
    description: 'Consulta OS abertas pra um cliente IXC específico. Retorna até 5 últimas com data + técnico.',
    method: 'GET',
    endpoint: 'https://api.texnet.com.br/v2/os?cliente_id={cliente_id}&status=aberta',
    schema: '{ "cliente_id": "number (required)" }',
    destructive: false,
    createdAt: '2026-04-12T15:00:00Z',
    invocations30d: 1_842,
    errorRate: 0.012,
  },
  {
    id: 'ct_2',
    workspaceId: 'ws_texnet',
    name: 'texnet_agendar_visita_tecnica',
    description: 'Cria agendamento no IXC pra visita técnica. Valida slot disponível antes.',
    method: 'POST',
    endpoint: 'https://api.texnet.com.br/v2/agendamentos',
    schema: '{ "cliente_id": "number", "data": "ISO8601", "tipo": "instalacao|reparo|migracao", "observacao": "string" }',
    destructive: true,
    createdAt: '2026-04-20T09:30:00Z',
    invocations30d: 421,
    errorRate: 0.034,
  },
  {
    id: 'ct_3',
    workspaceId: 'ws_thribus',
    name: 'thribus_lead_score',
    description: 'Roda modelo interno de score em lead recém-criado. Retorna 0-100 + tier.',
    method: 'POST',
    endpoint: 'https://api.thribus.com.br/internal/lead-score',
    schema: '{ "lead_id": "string", "context": "object" }',
    destructive: false,
    createdAt: '2026-03-08T19:00:00Z',
    invocations30d: 2_318,
    errorRate: 0.004,
  },
];
