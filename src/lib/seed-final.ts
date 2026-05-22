/**
 * Seed consolidado — última leva (10 features finais).
 * Onboarding, notifications, settings/vault, webhooks, sandbox,
 * activity, optimizer, compliance.
 */

// ─── Onboarding Wizard ────────────────────────────────────────────────────
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface OnboardingStep {
  id: string;
  step: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  status: OnboardingStepStatus;
  cta: string;
}

export const SEED_ONBOARDING: OnboardingStep[] = [
  { id: 'ob_1', step: 1, title: 'Criar seu workspace', description: 'Nome da empresa, vertical, idioma do agente, fuso horário.', estimatedMinutes: 1, status: 'completed', cta: 'Configurar' },
  { id: 'ob_2', step: 2, title: 'Conectar primeiro canal', description: 'WhatsApp via 360dialog, email via Gmail, ou widget web. Auth automática.', estimatedMinutes: 3, status: 'completed', cta: 'Conectar' },
  { id: 'ob_3', step: 3, title: 'Importar conhecimento', description: 'Sobe PDFs, planilhas, URLs ou Notion. O agente lê e responde com base nisso.', estimatedMinutes: 5, status: 'in_progress', cta: 'Ingerir docs' },
  { id: 'ob_4', step: 4, title: 'Criar seu primeiro agente', description: 'Use um template (Vendas ISP, Suporte N1, Cobrança) ou comece do zero no Studio.', estimatedMinutes: 4, status: 'pending', cta: 'Criar agente' },
  { id: 'ob_5', step: 5, title: 'Testar e ativar', description: 'Chat com agente no Playground, ajusta prompt, ativa em produção.', estimatedMinutes: 3, status: 'pending', cta: 'Testar' },
];

// ─── Notification Center ──────────────────────────────────────────────────
export type NotifKind = 'system' | 'approval' | 'alert' | 'mention' | 'workflow' | 'billing' | 'announcement';

export interface AppNotification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  timestamp: string;
  source?: string;
}

export const SEED_NOTIFICATIONS: AppNotification[] = [
  { id: 'nt_meta_1', kind: 'alert', title: 'Canal WaBA1068388046366539 restrito pela Meta', body: 'Your account has been restricted by Meta. You are no longer allowed to add new phone numbers or send any messages. Período: 14/05/2026 06:16 → 13/06/2026 06:16. Ação: entrar em contato com time responsável ou avaliar canal alternativo pra seguir com o processo.', href: '/integrations', read: false, timestamp: '2026-05-21T00:20:00Z', source: 'Bukowiski · Gerente de Operações Thribus Tech' },
  { id: 'nt_meta_2', kind: 'system', title: 'Análise canal WaBA — opções de contorno', body: 'Análise feita: Meta está normalizado do lado deles. Opções: 1) aguardar propagação automática pro 360dialog · 2) tentar integração direta com Meta (bypass 360) · 3) esperar fim da restrição em 13/06.', href: '/integrations', read: false, timestamp: '2026-05-21T00:19:00Z', source: 'Bukowiski · Gerente de Operações Thribus Tech' },
  { id: 'nt_1', kind: 'approval', title: 'Bianca pediu aprovação — Refund Stripe R$ 199', body: 'Cliente cancelou no prazo de arrependimento (7d). Política autoriza.', href: '/integrations', read: false, timestamp: '2026-05-17T11:48:00Z', source: 'Agent Bianca' },
  { id: 'nt_2', kind: 'alert', title: 'IXC com latência > 1s', body: 'Detectada lentidão no IXC nas últimas 24min. Tools afetadas: ixc_consulta_cliente, ixc_alterar_plano.', href: '/status', read: false, timestamp: '2026-05-17T11:32:00Z', source: 'Sistema' },
  { id: 'nt_3', kind: 'mention', title: 'Marcia te mencionou em uma conversa', body: '"@charles essa Aline já é a 3ª esse mês citando Brisanet..."', href: '/inbox', read: false, timestamp: '2026-05-17T09:25:00Z', source: 'Marcia Lopes' },
  { id: 'nt_4', kind: 'workflow', title: 'Workflow SLA-breach disparou 2x hoje', body: 'Workflow "SLA > 2h sem resposta humana" escalou 2 conversas. Verifique fila.', href: '/orchestration', read: false, timestamp: '2026-05-17T08:42:00Z', source: 'Workflow Engine' },
  { id: 'nt_5', kind: 'billing', title: 'Fatura pendente — Holding Telecom Sul', body: 'R$ 1.980 vencendo amanhã. Past due 3 dias.', href: '/billing', read: true, timestamp: '2026-05-16T18:00:00Z', source: 'Stripe' },
  { id: 'nt_6', kind: 'system', title: 'PII detectada e bloqueada', body: 'Cliente enviou número de cartão. Mensagem mascarada antes de logar.', href: '/lgpd', read: true, timestamp: '2026-05-16T10:15:00Z', source: 'PII Scanner' },
  { id: 'nt_7', kind: 'announcement', title: 'Novidade: Agent Studio publicado', body: 'Builder no-code pra montar agente arrastando blocos. Confere em /studio.', href: '/studio', read: true, timestamp: '2026-05-15T14:00:00Z', source: 'Thribus' },
];

// ─── Settings (vault + api keys + outbound webhooks) ─────────────────────
export interface SecretEntry {
  id: string;
  key: string;
  category: 'crm' | 'erp' | 'payment' | 'comms' | 'analytics' | 'custom';
  maskedValue: string;
  lastUsedAt?: string;
  rotatesEveryDays?: number;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  label: string;
  scopes: string[];
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export const SEED_SECRETS: SecretEntry[] = [
  { id: 's_1', key: 'IXC_TOKEN', category: 'erp', maskedValue: '••••••••AB12', lastUsedAt: '2026-05-17T11:42:00Z', rotatesEveryDays: 90, createdAt: '2025-11-15T00:00:00Z' },
  { id: 's_2', key: 'IXC_HASH', category: 'erp', maskedValue: '••••••••XY78', lastUsedAt: '2026-05-17T11:42:00Z', rotatesEveryDays: 90, createdAt: '2025-11-15T00:00:00Z' },
  { id: 's_3', key: 'STRIPE_SECRET_KEY', category: 'payment', maskedValue: 'sk_live_••••8421', lastUsedAt: '2026-05-17T10:14:00Z', createdAt: '2025-08-22T00:00:00Z' },
  { id: 's_4', key: 'ASAAS_API_KEY', category: 'payment', maskedValue: '$aact_••••K2Mz', lastUsedAt: '2026-05-17T11:42:00Z', createdAt: '2026-01-15T00:00:00Z' },
  { id: 's_5', key: 'TALKI_API_TOKEN', category: 'comms', maskedValue: '••••••••mP4q', lastUsedAt: '2026-05-17T11:50:00Z', createdAt: '2025-09-10T00:00:00Z' },
  { id: 's_6', key: '360DIALOG_API_KEY', category: 'comms', maskedValue: '••••••••9rTx', lastUsedAt: '2026-05-17T11:48:00Z', rotatesEveryDays: 180, createdAt: '2025-12-01T00:00:00Z' },
  { id: 's_7', key: 'GEOGRID_API_KEY', category: 'analytics', maskedValue: '••••••••L33t', lastUsedAt: '2026-05-17T11:40:00Z', createdAt: '2026-02-12T00:00:00Z' },
  { id: 's_8', key: 'ELEVENLABS_API_KEY', category: 'comms', maskedValue: 'sk_••••f4N1', lastUsedAt: '2026-05-15T16:48:00Z', createdAt: '2026-03-08T00:00:00Z' },
];

export const SEED_API_KEYS: ApiKey[] = [
  { id: 'k_1', label: 'Produção (worker)', scopes: ['agents:execute', 'conversations:write', 'tools:execute'], prefix: 'thb_live_pk_8a4f', lastUsedAt: '2026-05-17T11:42:00Z', createdAt: '2025-08-22T00:00:00Z' },
  { id: 'k_2', label: 'Staging', scopes: ['agents:execute', 'conversations:write', 'tools:execute'], prefix: 'thb_test_pk_3xqz', lastUsedAt: '2026-05-12T09:30:00Z', createdAt: '2025-09-10T00:00:00Z' },
  { id: 'k_3', label: 'Read-only (BI)', scopes: ['analytics:read', 'conversations:read'], prefix: 'thb_live_pk_9LmR', lastUsedAt: '2026-05-17T07:00:00Z', createdAt: '2026-01-05T00:00:00Z', expiresAt: '2026-12-31T23:59:59Z' },
];

// ─── Outbound Webhooks ────────────────────────────────────────────────────
export type WebhookEvent =
  | 'agent.replied' | 'agent.escalated' | 'conversation.created' | 'conversation.closed'
  | 'tool.executed' | 'tool.approval_requested' | 'lead.qualified' | 'sale.closed' | 'sla.breached';

export interface OutboundWebhook {
  id: string;
  label: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  successRate: number;
  deliveries30d: number;
  lastTriggeredAt?: string;
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  status: 'success' | 'failed' | 'retrying';
  httpCode: number;
  attemptCount: number;
  latencyMs: number;
  timestamp: string;
}

export const SEED_WEBHOOKS: OutboundWebhook[] = [
  { id: 'wh_1', label: 'CRM Holding — atualizar lead', url: 'https://crm.holding-telecom-sul.com.br/webhooks/thribus', events: ['lead.qualified', 'sale.closed', 'conversation.closed'], active: true, successRate: 0.987, deliveries30d: 1_842, lastTriggeredAt: '2026-05-17T11:42:00Z', secret: 'whsec_•••••' },
  { id: 'wh_2', label: 'Slack #alertas-thribus', url: 'https://hooks.slack.com/services/T0/B0/...', events: ['agent.escalated', 'sla.breached', 'tool.approval_requested'], active: true, successRate: 1.0, deliveries30d: 89, lastTriggeredAt: '2026-05-17T11:32:00Z', secret: 'whsec_•••••' },
  { id: 'wh_3', label: 'Data warehouse (BigQuery)', url: 'https://api.thribus.com.br/internal/bq-sink', events: ['conversation.created', 'conversation.closed', 'tool.executed', 'sale.closed'], active: true, successRate: 0.998, deliveries30d: 18_412, lastTriggeredAt: '2026-05-17T11:51:00Z', secret: 'whsec_•••••' },
  { id: 'wh_4', label: 'Pipedrive sync (Aionics)', url: 'https://api.pipedrive.com/v1/webhooks/...', events: ['lead.qualified', 'sale.closed'], active: false, successRate: 0.42, deliveries30d: 8, lastTriggeredAt: '2026-04-22T09:00:00Z', secret: 'whsec_•••••' },
];

export const SEED_WEBHOOK_DELIVERIES: WebhookDelivery[] = [
  { id: 'wd_1', webhookId: 'wh_1', event: 'sale.closed', url: 'https://crm...', status: 'success', httpCode: 200, attemptCount: 1, latencyMs: 312, timestamp: '2026-05-17T11:42:00Z' },
  { id: 'wd_2', webhookId: 'wh_2', event: 'sla.breached', url: 'https://hooks.slack.com/...', status: 'success', httpCode: 200, attemptCount: 1, latencyMs: 188, timestamp: '2026-05-17T11:32:00Z' },
  { id: 'wd_3', webhookId: 'wh_3', event: 'conversation.created', url: 'https://api.thribus...', status: 'success', httpCode: 201, attemptCount: 1, latencyMs: 92, timestamp: '2026-05-17T11:30:00Z' },
  { id: 'wd_4', webhookId: 'wh_4', event: 'sale.closed', url: 'https://api.pipedrive...', status: 'failed', httpCode: 503, attemptCount: 3, latencyMs: 5_000, timestamp: '2026-04-22T09:00:00Z' },
  { id: 'wd_5', webhookId: 'wh_1', event: 'lead.qualified', url: 'https://crm...', status: 'retrying', httpCode: 502, attemptCount: 2, latencyMs: 1_240, timestamp: '2026-05-17T11:50:00Z' },
];

// ─── Sandbox / Trial Workspace ────────────────────────────────────────────
export interface SandboxTrial {
  id: string;
  workspaceId: string;
  companyName: string;
  industry: string;
  expiresAt: string;
  daysLeft: number;
  syntheticDataLoaded: boolean;
  conversationsTested: number;
  agentsCreated: number;
  convertedToPaid: boolean;
  ownerEmail: string;
}

export const SEED_TRIALS: SandboxTrial[] = [
  { id: 't_1', workspaceId: 'ws_trial_1', companyName: 'NetSul Telecom (POC)', industry: 'ISP', expiresAt: '2026-05-24T00:00:00Z', daysLeft: 7, syntheticDataLoaded: true, conversationsTested: 42, agentsCreated: 1, convertedToPaid: false, ownerEmail: 'cto@netsul.com.br' },
  { id: 't_2', workspaceId: 'ws_trial_2', companyName: 'Padaria Pão Quente (PJ)', industry: 'Varejo', expiresAt: '2026-05-30T00:00:00Z', daysLeft: 13, syntheticDataLoaded: false, conversationsTested: 4, agentsCreated: 0, convertedToPaid: false, ownerEmail: 'pao.quente@gmail.com' },
  { id: 't_3', workspaceId: 'ws_trial_3', companyName: 'Clínica Saúde Total', industry: 'Saúde', expiresAt: '2026-06-10T00:00:00Z', daysLeft: 24, syntheticDataLoaded: true, conversationsTested: 218, agentsCreated: 2, convertedToPaid: true, ownerEmail: 'admin@saudetotal.com.br' },
];

// ─── Activity Feed (real-time) ────────────────────────────────────────────
export type ActivityType =
  | 'sale_closed' | 'agent_replied' | 'escalation' | 'tool_executed'
  | 'lead_qualified' | 'churn_risk' | 'config_change' | 'sentiment_drop';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  agentName?: string;
  customerName?: string;
  value?: string;
  timestamp: string;
}

export const SEED_ACTIVITY: ActivityEvent[] = [
  { id: 'a_1', type: 'sale_closed', title: 'Venda fechada', detail: 'Plano Fibra 600 mega', agentName: 'Bianca', customerName: 'Maria Aparecida', value: 'R$ 99,90/mês', timestamp: '2026-05-17T11:42:00Z' },
  { id: 'a_2', type: 'escalation', title: 'Conversa escalada', detail: 'Sentimento negativo + menção concorrente', agentName: 'Bianca → Carla', customerName: 'Aline Souza', timestamp: '2026-05-17T11:38:00Z' },
  { id: 'a_3', type: 'tool_executed', title: 'Tool executada', detail: 'consultar_viabilidade • 142ms', agentName: 'Bianca', customerName: 'Pedro H.', timestamp: '2026-05-17T11:36:00Z' },
  { id: 'a_4', type: 'lead_qualified', title: 'Lead qualificado', detail: 'PJ — padaria 1Gbps comercial', agentName: 'Bianca', customerName: 'Carla Mendes', value: 'R$ 350/mês potencial', timestamp: '2026-05-17T11:30:00Z' },
  { id: 'a_5', type: 'agent_replied', title: 'Resposta gerada', detail: '248 tokens · 2.27s', agentName: 'Renata', customerName: 'Roberto Lima', timestamp: '2026-05-17T11:28:00Z' },
  { id: 'a_6', type: 'churn_risk', title: 'Risco de churn detectado', detail: 'Menção Brisanet 2x + sentiment -0.4', agentName: 'Sistema', customerName: 'Aline Souza', timestamp: '2026-05-17T11:22:00Z' },
  { id: 'a_7', type: 'config_change', title: 'Prompt atualizado', detail: 'Bianca v1.4.2 → v1.5.0-rc1 (em teste A/B)', agentName: 'Charles Andrade', timestamp: '2026-05-17T11:18:00Z' },
  { id: 'a_8', type: 'sentiment_drop', title: 'Sentimento caiu', detail: 'Aline +0.2 → -0.3 em 3 msgs', customerName: 'Aline Souza', timestamp: '2026-05-17T11:15:00Z' },
  { id: 'a_9', type: 'sale_closed', title: 'Venda fechada', detail: 'Plano Fibra 1Gbps PJ', agentName: 'Bianca', customerName: 'Carla Mendes', value: 'R$ 350/mês', timestamp: '2026-05-17T08:32:00Z' },
];

// ─── AI Cost Optimizer ────────────────────────────────────────────────────
export interface OptimizationRecommendation {
  id: string;
  agentId: string;
  agentName: string;
  type: 'model_swap' | 'cache_increase' | 'prompt_compress' | 'tool_dedup' | 'context_trim';
  current: string;
  recommended: string;
  estimatedSavingsMonthly: number;
  qualityImpact: number;
  confidence: number;
  applied: boolean;
}

export const SEED_OPTIMIZATIONS: OptimizationRecommendation[] = [
  { id: 'op_1', agentId: 'agent_renata', agentName: 'Renata (Suporte)', type: 'model_swap', current: 'gpt-4o ($2.50/$10 por 1M tok)', recommended: 'claude-haiku-4-5 ($0.25/$1.25 por 1M tok)', estimatedSavingsMonthly: 412, qualityImpact: -0.04, confidence: 0.91, applied: false },
  { id: 'op_2', agentId: 'agent_bianca', agentName: 'Bianca (Vendas)', type: 'cache_increase', current: 'cache TTL 1h · hit rate 42%', recommended: 'cache TTL 24h pra system prompt · hit rate ~85%', estimatedSavingsMonthly: 218, qualityImpact: 0, confidence: 0.96, applied: false },
  { id: 'op_3', agentId: 'agent_marcos', agentName: 'Marcos (Cobrança)', type: 'prompt_compress', current: '1.842 chars system prompt', recommended: '982 chars (mesma instrução, menos redundância)', estimatedSavingsMonthly: 94, qualityImpact: -0.01, confidence: 0.88, applied: false },
  { id: 'op_4', agentId: 'agent_carla', agentName: 'Carla (Retenção)', type: 'tool_dedup', current: '14 tools habilitadas · 6 raramente usadas', recommended: 'Remover 6 tools dormentes · reduz token de tool defs em ~3k/conversa', estimatedSavingsMonthly: 64, qualityImpact: 0, confidence: 0.84, applied: false },
  { id: 'op_5', agentId: 'agent_bianca', agentName: 'Bianca (Vendas)', type: 'context_trim', current: 'janela de 12 msgs anteriores', recommended: '6 msgs + resumo das anteriores · cliente em conversa longa', estimatedSavingsMonthly: 142, qualityImpact: -0.02, confidence: 0.79, applied: true },
];

// ─── Compliance Report Builder ────────────────────────────────────────────
export type CompliancePack = 'lgpd' | 'soc2' | 'iso27001' | 'gdpr' | 'pci_dss';

export interface CompliancePackBuild {
  id: string;
  pack: CompliancePack;
  packLabel: string;
  workspaceId: string;
  buildedAt?: string;
  status: 'idle' | 'building' | 'ready' | 'expired';
  sections: { name: string; status: 'ok' | 'warning' | 'missing' }[];
  evidenceCount: number;
  validUntil?: string;
}

export const SEED_COMPLIANCE_BUILDS: CompliancePackBuild[] = [
  { id: 'cb_1', pack: 'lgpd', packLabel: 'LGPD — Lei Geral de Proteção de Dados (BR)', workspaceId: 'ws_texnet', status: 'ready', buildedAt: '2026-05-15T18:00:00Z', validUntil: '2026-08-15T00:00:00Z',
    sections: [
      { name: 'Política de Privacidade publicada', status: 'ok' },
      { name: 'DPO designado e contato disponível', status: 'ok' },
      { name: 'DSR workflow (Art. 18) — 4 requests resolvidos /30d', status: 'ok' },
      { name: 'Consent log com base legal por finalidade', status: 'ok' },
      { name: 'PII Scanner ativo em todos os canais', status: 'ok' },
      { name: 'Retenção configurada por workspace', status: 'ok' },
      { name: 'Data residency BR (sa-east-1)', status: 'ok' },
      { name: 'Termo de uso de IA explícito', status: 'warning' },
    ], evidenceCount: 142 },
  { id: 'cb_2', pack: 'soc2', packLabel: 'SOC 2 Type II', workspaceId: 'ws_texnet', status: 'building',
    sections: [
      { name: 'Security — controles de acesso (RBAC)', status: 'ok' },
      { name: 'Availability — SLA dashboards', status: 'ok' },
      { name: 'Confidentiality — encryption at rest + in transit', status: 'ok' },
      { name: 'Audit log imutável /365d', status: 'ok' },
      { name: 'Processing Integrity — eval suites em CI', status: 'warning' },
      { name: 'Privacy — DSR + consent', status: 'ok' },
      { name: 'Vendor management (Stripe, Anthropic, OpenAI)', status: 'warning' },
      { name: 'Penetration test anual', status: 'missing' },
    ], evidenceCount: 218 },
  { id: 'cb_3', pack: 'iso27001', packLabel: 'ISO/IEC 27001', workspaceId: 'ws_texnet', status: 'idle',
    sections: [
      { name: 'ISMS escopo definido', status: 'missing' },
      { name: 'Risk assessment documentado', status: 'missing' },
      { name: 'Statement of Applicability', status: 'missing' },
    ], evidenceCount: 0 },
];
