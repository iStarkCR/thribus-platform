/**
 * Seed — Customer 360 / Lead Memory.
 *
 * Perfil persistente do cliente final atendido pelos agentes.
 * Não confundir com workspace (cliente B2B do Thribus) — aqui é o lead/cliente
 * que conversa COM o bot.
 */

export type LeadStage = 'novo' | 'qualificado' | 'em_negociacao' | 'cliente' | 'churn';
export type LeadTemperature = 'frio' | 'morno' | 'quente';

export interface LeadFact {
  id: string;
  leadId: string;
  source: 'agent' | 'crm' | 'rag' | 'manual';
  category: 'preference' | 'context' | 'objection' | 'milestone';
  fact: string;
  confidence: number;
  capturedBy: string;
  capturedAt: string;
}

export interface LeadInteraction {
  id: string;
  leadId: string;
  channel: 'whatsapp' | 'email' | 'phone' | 'web' | 'instagram';
  agentName?: string;
  summary: string;
  sentiment: number;
  timestamp: string;
}

export interface LeadContract {
  id: string;
  leadId: string;
  product: string;
  status: 'ativo' | 'cancelado' | 'pendente';
  mrr: number;
  startedAt: string;
  endsAt?: string;
}

export interface CustomerProfile {
  id: string;
  workspaceId: string;
  name: string;
  phone: string;
  email?: string;
  document?: string;
  city: string;
  stage: LeadStage;
  temperature: LeadTemperature;
  score: number;
  ltv: number;
  totalSpent: number;
  sentimentTrend: number;
  tags: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  ownerAgentId?: string;
  ownerAgentName?: string;
}

export const SEED_CUSTOMERS: CustomerProfile[] = [
  { id: 'lead_1', workspaceId: 'ws_texnet', name: 'Maria Aparecida Silva', phone: '+5553991122334', email: 'maria.silva@gmail.com', document: '***.123.456-**', city: 'Bagé/RS', stage: 'em_negociacao', temperature: 'quente', score: 87, ltv: 4_800, totalSpent: 0, sentimentTrend: 0.6, tags: ['fibra-600', 'centro', 'promo-3m'], firstSeenAt: '2026-05-12T08:14:00Z', lastSeenAt: '2026-05-16T11:42:00Z', ownerAgentId: 'agent_bianca', ownerAgentName: 'Bianca' },
  { id: 'lead_2', workspaceId: 'ws_texnet', name: 'José Carlos Oliveira', phone: '+5553988776655', email: 'jose.oliveira@hotmail.com', document: '***.456.789-**', city: 'Bagé/RS', stage: 'cliente', temperature: 'morno', score: 72, ltv: 6_240, totalSpent: 2_398, sentimentTrend: -0.1, tags: ['fibra-300', 'inadimplente-1x', 'recuperado'], firstSeenAt: '2024-08-22T15:00:00Z', lastSeenAt: '2026-05-16T10:14:00Z', ownerAgentId: 'agent_marcos', ownerAgentName: 'Marcos' },
  { id: 'lead_3', workspaceId: 'ws_texnet', name: 'Aline Souza', phone: '+5553977665544', document: '***.789.012-**', city: 'Aceguá/RS', stage: 'cliente', temperature: 'frio', score: 41, ltv: 3_200, totalSpent: 5_198, sentimentTrend: -0.4, tags: ['fibra-1g', 'risco-churn', 'concorrente-mencionado'], firstSeenAt: '2023-02-10T11:00:00Z', lastSeenAt: '2026-05-16T09:22:00Z', ownerAgentId: 'agent_carla', ownerAgentName: 'Carla' },
  { id: 'lead_4', workspaceId: 'ws_texnet', name: 'Roberto Lima', phone: '+5553966554433', email: 'r.lima@gmail.com', document: '***.012.345-**', city: 'Bagé/RS', stage: 'cliente', temperature: 'morno', score: 65, ltv: 4_400, totalSpent: 8_796, sentimentTrend: 0.1, tags: ['fibra-600', 'cobranca-duplicada-resolvida'], firstSeenAt: '2022-09-05T14:30:00Z', lastSeenAt: '2026-05-15T16:48:00Z', ownerAgentId: 'agent_renata', ownerAgentName: 'Renata' },
  { id: 'lead_5', workspaceId: 'ws_texnet', name: 'Carla Mendes (PJ — Padaria Pão Quente)', phone: '+5553955443322', email: 'pao.quente@gmail.com', document: '00.***.000/0001-**', city: 'Bagé/RS', stage: 'qualificado', temperature: 'quente', score: 91, ltv: 14_400, totalSpent: 0, sentimentTrend: 0.7, tags: ['pj', 'fibra-1g', 'comercial', 'horario-pico'], firstSeenAt: '2026-05-14T10:00:00Z', lastSeenAt: '2026-05-16T08:30:00Z', ownerAgentId: 'agent_bianca', ownerAgentName: 'Bianca' },
  { id: 'lead_6', workspaceId: 'ws_texnet', name: 'Pedro Silveira', phone: '+5553944332211', city: 'Hulha Negra/RS', stage: 'novo', temperature: 'morno', score: 54, ltv: 0, totalSpent: 0, sentimentTrend: 0, tags: ['sem-cobertura-ainda'], firstSeenAt: '2026-05-16T07:00:00Z', lastSeenAt: '2026-05-16T07:08:00Z' },
];

export const SEED_LEAD_FACTS: LeadFact[] = [
  { id: 'lf_1', leadId: 'lead_1', source: 'agent', category: 'preference', fact: 'Prefere instalação aos sábados pela manhã', confidence: 0.92, capturedBy: 'Bianca', capturedAt: '2026-05-13T10:14:00Z' },
  { id: 'lf_2', leadId: 'lead_1', source: 'agent', category: 'context', fact: 'Trabalha em home-office, precisa de estabilidade pra videochamada', confidence: 0.88, capturedBy: 'Bianca', capturedAt: '2026-05-12T11:00:00Z' },
  { id: 'lf_3', leadId: 'lead_1', source: 'agent', category: 'objection', fact: 'Comparou com Vivo Fibra — questionou estabilidade', confidence: 0.85, capturedBy: 'Bianca', capturedAt: '2026-05-14T09:30:00Z' },
  { id: 'lf_4', leadId: 'lead_2', source: 'crm', category: 'milestone', fact: 'Atrasou 1 fatura em jan/2025, regularizou via PIX', confidence: 1.0, capturedBy: 'Sistema', capturedAt: '2025-02-12T10:00:00Z' },
  { id: 'lf_5', leadId: 'lead_3', source: 'agent', category: 'objection', fact: 'Mencionou concorrente "Brisanet" oferecendo mais barato', confidence: 0.93, capturedBy: 'Carla', capturedAt: '2026-05-15T17:20:00Z' },
  { id: 'lf_6', leadId: 'lead_3', source: 'agent', category: 'context', fact: 'Casa nova — pode estar avaliando trocar de plano com mudança', confidence: 0.70, capturedBy: 'Carla', capturedAt: '2026-05-15T17:22:00Z' },
  { id: 'lf_7', leadId: 'lead_5', source: 'agent', category: 'context', fact: 'Padaria recém-aberta — precisa de internet pra POS Stone + Wi-Fi cliente', confidence: 0.95, capturedBy: 'Bianca', capturedAt: '2026-05-14T10:30:00Z' },
];

export const SEED_LEAD_INTERACTIONS: LeadInteraction[] = [
  { id: 'i_1', leadId: 'lead_1', channel: 'whatsapp', agentName: 'Bianca', summary: 'Consultou viabilidade + recebeu oferta plano 600 mega', sentiment: 0.7, timestamp: '2026-05-16T11:42:00Z' },
  { id: 'i_2', leadId: 'lead_1', channel: 'whatsapp', agentName: 'Bianca', summary: 'Pediu pra pensar até segunda', sentiment: 0.3, timestamp: '2026-05-14T09:30:00Z' },
  { id: 'i_3', leadId: 'lead_1', channel: 'whatsapp', agentName: 'Bianca', summary: 'Primeira mensagem — pergunta sobre cobertura', sentiment: 0.5, timestamp: '2026-05-12T08:14:00Z' },
  { id: 'i_4', leadId: 'lead_3', channel: 'whatsapp', agentName: 'Carla', summary: 'Sinalizou cancelamento — handoff de Bianca pra retenção', sentiment: -0.5, timestamp: '2026-05-16T09:22:00Z' },
  { id: 'i_5', leadId: 'lead_5', channel: 'whatsapp', agentName: 'Bianca', summary: 'Negociação plano PJ 1Gbps + Wi-Fi mesh', sentiment: 0.8, timestamp: '2026-05-16T08:30:00Z' },
];

export const SEED_LEAD_CONTRACTS: LeadContract[] = [
  { id: 'cn_1', leadId: 'lead_2', product: 'Fibra 300 mega', status: 'ativo', mrr: 79.90, startedAt: '2024-08-25T00:00:00Z' },
  { id: 'cn_2', leadId: 'lead_3', product: 'Fibra 1 Gbps', status: 'ativo', mrr: 159.90, startedAt: '2023-02-15T00:00:00Z' },
  { id: 'cn_3', leadId: 'lead_4', product: 'Fibra 600 mega', status: 'ativo', mrr: 99.90, startedAt: '2022-09-08T00:00:00Z' },
];
