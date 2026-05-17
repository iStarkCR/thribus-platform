/**
 * Seeds consolidados pras 7 páginas finais —
 * LGPD, Insights/VoC, Partner, Status, API docs, Help, Mobile.
 */

// ─── LGPD ─────────────────────────────────────────────────────────────────
export type DsrType = 'access' | 'portability' | 'deletion' | 'rectification' | 'consent_revoke';
export type DsrStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface DsrRequest {
  id: string;
  type: DsrType;
  status: DsrStatus;
  customerName: string;
  customerEmail: string;
  workspaceId: string;
  requestedAt: string;
  completedAt?: string;
  slaDeadline: string;
  assignedTo?: string;
}

export interface PiiDetection {
  id: string;
  messageId: string;
  conversationId: string;
  category: 'cpf' | 'cnpj' | 'cartao' | 'cep' | 'rg' | 'email' | 'telefone';
  value: string;
  masked: string;
  action: 'masked' | 'flagged' | 'blocked';
  timestamp: string;
}

export interface ConsentRecord {
  id: string;
  customerName: string;
  customerEmail: string;
  purpose: 'marketing' | 'analytics' | 'support' | 'profiling';
  granted: boolean;
  channel: string;
  timestamp: string;
  expiresAt?: string;
}

export const SEED_DSR: DsrRequest[] = [
  { id: 'dsr_1', type: 'access', status: 'completed', customerName: 'Maria Aparecida', customerEmail: 'maria.silva@gmail.com', workspaceId: 'ws_texnet', requestedAt: '2026-05-10T10:00:00Z', completedAt: '2026-05-11T14:00:00Z', slaDeadline: '2026-05-25T10:00:00Z', assignedTo: 'Marcia Lopes' },
  { id: 'dsr_2', type: 'deletion', status: 'in_progress', customerName: 'Pedro Henrique', customerEmail: 'pedro.h@hotmail.com', workspaceId: 'ws_texnet', requestedAt: '2026-05-14T15:30:00Z', slaDeadline: '2026-05-29T15:30:00Z', assignedTo: 'Charles Andrade' },
  { id: 'dsr_3', type: 'portability', status: 'pending', customerName: 'Aline Souza', customerEmail: 'aline.s@yahoo.com', workspaceId: 'ws_texnet', requestedAt: '2026-05-16T09:22:00Z', slaDeadline: '2026-05-31T09:22:00Z' },
  { id: 'dsr_4', type: 'consent_revoke', status: 'completed', customerName: 'Roberto Lima', customerEmail: 'r.lima@gmail.com', workspaceId: 'ws_texnet', requestedAt: '2026-04-28T11:00:00Z', completedAt: '2026-04-28T11:05:00Z', slaDeadline: '2026-05-13T11:00:00Z' },
];

export const SEED_PII: PiiDetection[] = [
  { id: 'pii_1', messageId: 'msg_42', conversationId: 'cv_1', category: 'cpf', value: '123.456.789-00', masked: '***.456.***-**', action: 'masked', timestamp: '2026-05-16T11:41:00Z' },
  { id: 'pii_2', messageId: 'msg_88', conversationId: 'cv_3', category: 'cartao', value: '5478 1234 5678 9012', masked: '**** **** **** 9012', action: 'blocked', timestamp: '2026-05-16T10:15:00Z' },
  { id: 'pii_3', messageId: 'msg_120', conversationId: 'cv_4', category: 'cnpj', value: '00.123.456/0001-90', masked: '**.***.***/0001-**', action: 'masked', timestamp: '2026-05-16T08:28:00Z' },
  { id: 'pii_4', messageId: 'msg_55', conversationId: 'cv_2', category: 'telefone', value: '+5553977665544', masked: '+5553*****5544', action: 'flagged', timestamp: '2026-05-15T17:00:00Z' },
];

export const SEED_CONSENT: ConsentRecord[] = [
  { id: 'cs_1', customerName: 'Maria Aparecida', customerEmail: 'maria.silva@gmail.com', purpose: 'marketing', granted: true, channel: 'WhatsApp', timestamp: '2026-05-12T08:14:00Z', expiresAt: '2027-05-12T08:14:00Z' },
  { id: 'cs_2', customerName: 'Maria Aparecida', customerEmail: 'maria.silva@gmail.com', purpose: 'analytics', granted: true, channel: 'WhatsApp', timestamp: '2026-05-12T08:14:00Z' },
  { id: 'cs_3', customerName: 'Roberto Lima', customerEmail: 'r.lima@gmail.com', purpose: 'marketing', granted: false, channel: 'Email opt-out', timestamp: '2026-04-28T11:05:00Z' },
  { id: 'cs_4', customerName: 'Aline Souza', customerEmail: 'aline.s@yahoo.com', purpose: 'profiling', granted: true, channel: 'WhatsApp', timestamp: '2023-02-10T11:00:00Z' },
];

// ─── Insights / Voice of Customer ─────────────────────────────────────────
export interface DailyInsight {
  id: string;
  workspaceId: string;
  date: string;
  category: 'wins' | 'losses' | 'anomaly' | 'opportunity' | 'risk';
  title: string;
  body: string;
  impact: 'low' | 'medium' | 'high';
  metric?: string;
  recommendation?: string;
}

export interface VocTheme {
  id: string;
  theme: string;
  category: 'preço' | 'qualidade' | 'atendimento' | 'cobertura' | 'cobrança' | 'concorrente';
  mentions30d: number;
  trend: number;
  sentimentAvg: number;
  representativeQuote: string;
  affectedRevenue?: number;
}

export const SEED_INSIGHTS: DailyInsight[] = [
  { id: 'in_1', workspaceId: 'ws_texnet', date: '2026-05-17', category: 'wins', title: 'Bianca quebrou recorde de fechamento', body: 'Bianca fechou 12 vendas ontem (vs. média 7,2). Padrão: ofertas com promo 3m + agendamento sábado.', impact: 'high', metric: '+67% vs. média', recommendation: 'Reforçar template /promo3m no início da semana' },
  { id: 'in_2', workspaceId: 'ws_texnet', date: '2026-05-17', category: 'risk', title: '3 menções a Brisanet em retenção', body: 'Última semana teve 3 clientes citando Brisanet como motivo de cancelamento — todos em Bagé/Centro.', impact: 'high', metric: '3 clientes em risco', recommendation: 'Rodar análise de cobertura Brisanet vs. TexNet no Centro de Bagé' },
  { id: 'in_3', workspaceId: 'ws_texnet', date: '2026-05-17', category: 'opportunity', title: 'PJ representa 18% das conversas', body: 'Aumento de leads PJ (padarias, escritórios). Hoje só 4% viraram cliente. Bianca não tem skill PJ específica.', impact: 'medium', metric: '18% leads · 4% conv', recommendation: 'Instalar skill PJ-comercial do marketplace ou criar template Bianca-PJ' },
  { id: 'in_4', workspaceId: 'ws_texnet', date: '2026-05-17', category: 'anomaly', title: 'Tool ixc_alterar_plano com erro alto', body: 'Taxa de erro subiu pra 7% nas últimas 24h (média 0,5%). Não bloqueou venda mas frustrou 4 clientes.', impact: 'medium', metric: '7% erro · 4 frustrações', recommendation: 'Investigar logs do IXC — pode ser cache stale' },
  { id: 'in_5', workspaceId: 'ws_texnet', date: '2026-05-17', category: 'losses', title: '4 oportunidades perdidas por preço', body: 'Bianca abriu objeção de preço em 4 conversas, não converteu. Concorrente cita R$ 79 vs. nosso R$ 99,90.', impact: 'medium', metric: 'R$ 4.8k LTV potencial', recommendation: 'Avaliar promo competitiva no segmento entrada' },
];

export const SEED_VOC: VocTheme[] = [
  { id: 'voc_1', theme: 'Preço alto comparado à concorrência', category: 'preço', mentions30d: 87, trend: 0.34, sentimentAvg: -0.4, representativeQuote: '"Brisanet faz por R$ 79, vocês cobram R$ 99 pelo mesmo plano"', affectedRevenue: 28_400 },
  { id: 'voc_2', theme: 'Wi-Fi cai à noite (horário de pico)', category: 'qualidade', mentions30d: 142, trend: -0.12, sentimentAvg: -0.6, representativeQuote: '"das 19h às 23h fica horrível, não dá pra trabalhar"', affectedRevenue: 12_800 },
  { id: 'voc_3', theme: 'Atendimento rápido foi elogiado', category: 'atendimento', mentions30d: 218, trend: 0.18, sentimentAvg: 0.7, representativeQuote: '"vocês respondem rapidíssimo, adoro o atendimento"' },
  { id: 'voc_4', theme: 'Falta cobertura em Hulha Negra', category: 'cobertura', mentions30d: 24, trend: 0.5, sentimentAvg: -0.2, representativeQuote: '"quando vocês vão expandir pra Hulha Negra?"', affectedRevenue: 4_200 },
  { id: 'voc_5', theme: 'Boleto não chega no email', category: 'cobrança', mentions30d: 38, trend: 0.08, sentimentAvg: -0.3, representativeQuote: '"não recebi o boleto esse mês, mandam de novo"' },
];

// ─── Partner Portal ───────────────────────────────────────────────────────
export interface Partner {
  id: string;
  name: string;
  tier: 'silver' | 'gold' | 'platinum';
  commissionRate: number;
  totalReferrals: number;
  activeClients: number;
  mrrAttributed: number;
  payoutsYTD: number;
  joinedAt: string;
}

export interface PartnerLead {
  id: string;
  partnerId: string;
  partnerName: string;
  leadName: string;
  status: 'new' | 'qualified' | 'demo' | 'proposal' | 'won' | 'lost';
  estimatedMrr: number;
  createdAt: string;
}

export const SEED_PARTNERS: Partner[] = [
  { id: 'pt_1', name: 'Agência Conecta+', tier: 'platinum', commissionRate: 0.30, totalReferrals: 24, activeClients: 18, mrrAttributed: 8_412, payoutsYTD: 14_280, joinedAt: '2025-02-10T00:00:00Z' },
  { id: 'pt_2', name: 'AionicsBR', tier: 'gold', commissionRate: 0.20, totalReferrals: 14, activeClients: 9, mrrAttributed: 4_120, payoutsYTD: 6_840, joinedAt: '2025-08-22T00:00:00Z' },
  { id: 'pt_3', name: 'CCom Consultoria', tier: 'silver', commissionRate: 0.15, totalReferrals: 6, activeClients: 4, mrrAttributed: 1_280, payoutsYTD: 1_920, joinedAt: '2026-01-15T00:00:00Z' },
];

export const SEED_PARTNER_LEADS: PartnerLead[] = [
  { id: 'pl_1', partnerId: 'pt_1', partnerName: 'Agência Conecta+', leadName: 'Provedor Vale Net', status: 'demo', estimatedMrr: 1_800, createdAt: '2026-05-14T00:00:00Z' },
  { id: 'pl_2', partnerId: 'pt_1', partnerName: 'Agência Conecta+', leadName: 'NetSul Telecom', status: 'proposal', estimatedMrr: 2_400, createdAt: '2026-05-11T00:00:00Z' },
  { id: 'pl_3', partnerId: 'pt_2', partnerName: 'AionicsBR', leadName: 'EcommercePlus', status: 'qualified', estimatedMrr: 980, createdAt: '2026-05-15T00:00:00Z' },
  { id: 'pl_4', partnerId: 'pt_3', partnerName: 'CCom Consultoria', leadName: 'Clínica Saúde Total', status: 'new', estimatedMrr: 640, createdAt: '2026-05-16T00:00:00Z' },
];

// ─── Status page ──────────────────────────────────────────────────────────
export type ServiceHealth = 'operational' | 'degraded' | 'outage' | 'maintenance';

export interface ServiceStatus {
  id: string;
  name: string;
  category: 'core' | 'integration' | 'channel';
  health: ServiceHealth;
  uptime30d: number;
  latencyMs: number;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedServices: string[];
  startedAt: string;
  resolvedAt?: string;
  updates: { timestamp: string; message: string }[];
}

export const SEED_SERVICES: ServiceStatus[] = [
  { id: 's_1', name: 'Worker (Bianca + Renata + Marcos + Carla)', category: 'core', health: 'operational', uptime30d: 99.94, latencyMs: 412 },
  { id: 's_2', name: 'Router multi-agente', category: 'core', health: 'operational', uptime30d: 99.98, latencyMs: 188 },
  { id: 's_3', name: 'Knowledge Base (RAG)', category: 'core', health: 'operational', uptime30d: 99.99, latencyMs: 142 },
  { id: 's_4', name: 'Painel (Vercel)', category: 'core', health: 'operational', uptime30d: 99.99, latencyMs: 88 },
  { id: 's_5', name: 'Talki / Chatwoot', category: 'integration', health: 'operational', uptime30d: 99.87, latencyMs: 245 },
  { id: 's_6', name: 'IXC ERP', category: 'integration', health: 'degraded', uptime30d: 99.41, latencyMs: 1_240 },
  { id: 's_7', name: '360dialog WhatsApp', category: 'channel', health: 'operational', uptime30d: 99.92, latencyMs: 380 },
  { id: 's_8', name: 'Stripe billing', category: 'integration', health: 'operational', uptime30d: 99.99, latencyMs: 220 },
  { id: 's_9', name: 'ElevenLabs (voz)', category: 'channel', health: 'maintenance', uptime30d: 98.12, latencyMs: 0 },
];

export const SEED_INCIDENTS: Incident[] = [
  { id: 'inc_1', title: 'Latência elevada no IXC ERP', severity: 'minor', status: 'monitoring', affectedServices: ['s_6'], startedAt: '2026-05-17T08:14:00Z', updates: [
    { timestamp: '2026-05-17T08:14:00Z', message: 'Detectada latência > 1s em queries ao IXC. Investigando.' },
    { timestamp: '2026-05-17T08:42:00Z', message: 'Identificado lock em tabela cliente. Cache stale.' },
    { timestamp: '2026-05-17T09:10:00Z', message: 'Cache reindexado. Monitorando estabilidade.' },
  ] },
  { id: 'inc_2', title: 'Manutenção programada — ElevenLabs', severity: 'minor', status: 'monitoring', affectedServices: ['s_9'], startedAt: '2026-05-17T02:00:00Z', updates: [
    { timestamp: '2026-05-17T02:00:00Z', message: 'Janela de manutenção 02:00–04:00. Canal de voz indisponível.' },
  ] },
  { id: 'inc_3', title: 'Timeout em webhooks 360dialog', severity: 'major', status: 'resolved', affectedServices: ['s_7'], startedAt: '2026-05-12T14:00:00Z', resolvedAt: '2026-05-12T15:42:00Z', updates: [
    { timestamp: '2026-05-12T14:00:00Z', message: 'Webhooks com timeout intermitente.' },
    { timestamp: '2026-05-12T15:42:00Z', message: 'Resolvido — ajuste no read-timeout do client.' },
  ] },
];

// ─── API Docs (preview Swagger-like) ──────────────────────────────────────
export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  tag: string;
  authRequired: boolean;
  requestExample?: string;
  responseExample?: string;
}

export const SEED_API_ENDPOINTS: ApiEndpoint[] = [
  { id: 'ep_1', method: 'GET', path: '/v1/agents', summary: 'Lista todos os agentes do workspace', tag: 'Agents', authRequired: true, responseExample: '[{"id":"agent_bianca","name":"Bianca","status":"online"}]' },
  { id: 'ep_2', method: 'POST', path: '/v1/agents', summary: 'Cria novo agente', tag: 'Agents', authRequired: true, requestExample: '{"name":"Carla","role":"retention","model":"gpt-4o"}', responseExample: '{"id":"agent_carla","created":true}' },
  { id: 'ep_3', method: 'POST', path: '/v1/agents/:id/chat', summary: 'Envia mensagem ao agente e recebe resposta', tag: 'Agents', authRequired: true, requestExample: '{"customer_id":"lead_1","message":"oi"}', responseExample: '{"response":"...","tokens_used":248,"tools_called":["consultar_viabilidade"]}' },
  { id: 'ep_4', method: 'GET', path: '/v1/customers/:id', summary: 'Perfil 360° do cliente', tag: 'Customers', authRequired: true },
  { id: 'ep_5', method: 'POST', path: '/v1/customers/:id/facts', summary: 'Adiciona fato memorizado', tag: 'Customers', authRequired: true },
  { id: 'ep_6', method: 'GET', path: '/v1/knowledge/:base_id/query', summary: 'Consulta semântica em base de conhecimento', tag: 'Knowledge', authRequired: true },
  { id: 'ep_7', method: 'POST', path: '/v1/knowledge/:base_id/ingest', summary: 'Adiciona documento à base (PDF, URL, sheet)', tag: 'Knowledge', authRequired: true },
  { id: 'ep_8', method: 'POST', path: '/v1/tools/:tool_id/execute', summary: 'Executa tool (pode requerer approval)', tag: 'Tools', authRequired: true },
  { id: 'ep_9', method: 'GET', path: '/v1/conversations', summary: 'Lista conversas (paginado)', tag: 'Inbox', authRequired: true },
  { id: 'ep_10', method: 'POST', path: '/v1/webhooks', summary: 'Cadastra webhook pra eventos', tag: 'Webhooks', authRequired: true },
  { id: 'ep_11', method: 'GET', path: '/v1/analytics/cost', summary: 'Custo agregado por agente/período', tag: 'Analytics', authRequired: true },
  { id: 'ep_12', method: 'POST', path: '/v1/experiments', summary: 'Cria experimento A/B', tag: 'Experiments', authRequired: true },
];

// ─── Help Center / Academy ────────────────────────────────────────────────
export interface HelpArticle {
  id: string;
  category: 'getting_started' | 'agents' | 'integrations' | 'troubleshooting' | 'best_practices';
  title: string;
  summary: string;
  readMinutes: number;
  views: number;
  helpful: number;
  updatedAt: string;
}

export interface AcademyCourse {
  id: string;
  title: string;
  level: 'iniciante' | 'intermediário' | 'avançado';
  modules: number;
  durationMin: number;
  enrolledCount: number;
  rating: number;
  certified: boolean;
}

export const SEED_HELP_ARTICLES: HelpArticle[] = [
  { id: 'h_1', category: 'getting_started', title: 'Primeiro agente em 10 minutos', summary: 'Cria seu primeiro agente do zero — persona, knowledge, primeira tool.', readMinutes: 8, views: 1_240, helpful: 891, updatedAt: '2026-05-01T00:00:00Z' },
  { id: 'h_2', category: 'integrations', title: 'Conectando WhatsApp via 360dialog', summary: 'Setup completo do canal — credencial, webhook, template aprovado.', readMinutes: 12, views: 821, helpful: 642, updatedAt: '2026-04-22T00:00:00Z' },
  { id: 'h_3', category: 'agents', title: 'Escrevendo um system prompt eficaz', summary: 'Padrões testados em 100k+ conversas — estrutura, exemplos, edge cases.', readMinutes: 18, views: 412, helpful: 358, updatedAt: '2026-05-10T00:00:00Z' },
  { id: 'h_4', category: 'troubleshooting', title: 'Por que minha tool tá com 5%+ de erro?', summary: 'Diagnóstico passo-a-passo — auth, timeout, schema, cache.', readMinutes: 6, views: 318, helpful: 280, updatedAt: '2026-05-08T00:00:00Z' },
  { id: 'h_5', category: 'best_practices', title: 'Quando usar skill vs. template', summary: 'Skill = comportamento. Template = agente novo. Decisão prática.', readMinutes: 5, views: 240, helpful: 198, updatedAt: '2026-04-15T00:00:00Z' },
  { id: 'h_6', category: 'agents', title: 'Multi-agente com roteamento de intenção', summary: 'Quando dividir em 3 agentes vs. um Frankenstein.', readMinutes: 10, views: 188, helpful: 142, updatedAt: '2026-05-12T00:00:00Z' },
];

export const SEED_COURSES: AcademyCourse[] = [
  { id: 'c_1', title: 'Fundamentos Thribus Agents', level: 'iniciante', modules: 8, durationMin: 120, enrolledCount: 412, rating: 4.8, certified: true },
  { id: 'c_2', title: 'Otimização de Prompt com Eval', level: 'intermediário', modules: 6, durationMin: 90, enrolledCount: 184, rating: 4.7, certified: true },
  { id: 'c_3', title: 'Arquitetura multi-agente em produção', level: 'avançado', modules: 10, durationMin: 180, enrolledCount: 72, rating: 4.9, certified: true },
  { id: 'c_4', title: 'Cortex Brain — guia do CTO', level: 'avançado', modules: 12, durationMin: 240, enrolledCount: 38, rating: 4.8, certified: true },
];

// ─── Mobile / PWA ─────────────────────────────────────────────────────────
export interface MobileNotification {
  id: string;
  type: 'approval' | 'alert' | 'sla_breach' | 'mention' | 'report';
  title: string;
  body: string;
  conversationId?: string;
  timestamp: string;
  read: boolean;
  pushSent: boolean;
}

export const SEED_MOBILE_NOTIFS: MobileNotification[] = [
  { id: 'mn_1', type: 'approval', title: 'Aprovação pendente — Refund Stripe R$ 199', body: 'Bianca solicitou refund pra cliente. Aprova/Rejeita.', conversationId: 'cv_1', timestamp: '2026-05-17T11:48:00Z', read: false, pushSent: true },
  { id: 'mn_2', type: 'sla_breach', title: 'SLA estourou — Aline Souza', body: 'Escalação aberta há 2h15min sem resposta.', conversationId: 'cv_2', timestamp: '2026-05-17T11:35:00Z', read: false, pushSent: true },
  { id: 'mn_3', type: 'mention', title: 'Marcia te mencionou', body: '"@charles essa Aline já é a 3ª esse mês citando Brisanet..."', conversationId: 'cv_2', timestamp: '2026-05-17T09:25:00Z', read: true, pushSent: true },
  { id: 'mn_4', type: 'alert', title: 'PII detectada — cartão de crédito', body: 'Cliente mandou número de cartão. Bloqueado automaticamente.', conversationId: 'cv_3', timestamp: '2026-05-16T10:15:00Z', read: true, pushSent: true },
  { id: 'mn_5', type: 'report', title: 'Report semanal pronto', body: 'Executivo semanal — TexNet gerado. Toque pra ver.', timestamp: '2026-05-17T11:00:00Z', read: true, pushSent: true },
];
