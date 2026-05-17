/**
 * Seed — Inbox Unificada.
 *
 * Timeline única por cliente — WhatsApp + email + phone + web + Instagram.
 * Agente troca de canal sem perder contexto.
 */

export type InboxChannel = 'whatsapp' | 'email' | 'phone' | 'web' | 'instagram';
export type InboxStatus = 'open' | 'pending' | 'escalated' | 'closed';

export interface InboxConversation {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  customerAvatar?: string;
  channels: InboxChannel[];
  primaryChannel: InboxChannel;
  status: InboxStatus;
  assignedAgentId?: string;
  assignedAgentName?: string;
  unreadCount: number;
  lastPreview: string;
  lastSentiment: number;
  lastActivityAt: string;
  tags: string[];
}

export interface InboxMessage {
  id: string;
  conversationId: string;
  channel: InboxChannel;
  direction: 'in' | 'out';
  sender: string;
  body: string;
  timestamp: string;
  isBot?: boolean;
  attachments?: { name: string; type: 'image' | 'audio' | 'file' }[];
}

export const SEED_INBOX_CONVERSATIONS: InboxConversation[] = [
  { id: 'cv_1', workspaceId: 'ws_texnet', customerId: 'lead_1', customerName: 'Maria Aparecida Silva', channels: ['whatsapp'], primaryChannel: 'whatsapp', status: 'open', assignedAgentId: 'agent_bianca', assignedAgentName: 'Bianca', unreadCount: 2, lastPreview: 'Sim, atendemos sua rua com fibra. Tenho plano de 600 mega por R$ 99,90/mês...', lastSentiment: 0.7, lastActivityAt: '2026-05-16T11:42:00Z', tags: ['venda', 'quente'] },
  { id: 'cv_2', workspaceId: 'ws_texnet', customerId: 'lead_3', customerName: 'Aline Souza', channels: ['whatsapp', 'phone'], primaryChannel: 'whatsapp', status: 'escalated', assignedAgentId: 'agent_carla', assignedAgentName: 'Carla', unreadCount: 0, lastPreview: 'Entendo sua frustração, Aline. Posso oferecer 30% de desconto pelos próximos 3 meses pra você reconsiderar?', lastSentiment: -0.3, lastActivityAt: '2026-05-16T09:22:00Z', tags: ['retencao', 'risco-churn'] },
  { id: 'cv_3', workspaceId: 'ws_texnet', customerId: 'lead_2', customerName: 'José Carlos Oliveira', channels: ['whatsapp'], primaryChannel: 'whatsapp', status: 'pending', assignedAgentId: 'agent_marcos', assignedAgentName: 'Marcos', unreadCount: 1, lastPreview: 'Já enviei o boleto pro seu email. Confirma se chegou?', lastSentiment: 0.1, lastActivityAt: '2026-05-16T10:14:00Z', tags: ['cobranca'] },
  { id: 'cv_4', workspaceId: 'ws_texnet', customerId: 'lead_5', customerName: 'Carla Mendes (Padaria Pão Quente)', channels: ['whatsapp', 'email'], primaryChannel: 'whatsapp', status: 'open', assignedAgentId: 'agent_bianca', assignedAgentName: 'Bianca', unreadCount: 0, lastPreview: 'Perfeito, vou te mandar a proposta de PJ 1Gbps + Wi-Fi mesh no email agora.', lastSentiment: 0.8, lastActivityAt: '2026-05-16T08:30:00Z', tags: ['pj', 'venda', 'quente'] },
  { id: 'cv_5', workspaceId: 'ws_texnet', customerId: 'lead_6', customerName: 'Pedro Silveira', channels: ['instagram'], primaryChannel: 'instagram', status: 'closed', unreadCount: 0, lastPreview: 'Infelizmente ainda não temos cobertura em Hulha Negra. Vou te avisar quando expandirmos!', lastSentiment: 0.2, lastActivityAt: '2026-05-16T07:08:00Z', tags: ['sem-cobertura', 'aguardando-expansao'] },
  { id: 'cv_6', workspaceId: 'ws_texnet', customerId: 'lead_4', customerName: 'Roberto Lima', channels: ['phone', 'whatsapp'], primaryChannel: 'phone', status: 'closed', assignedAgentId: 'agent_renata', assignedAgentName: 'Renata', unreadCount: 0, lastPreview: '[Ligação 4min] Cobrança duplicada resolvida via estorno', lastSentiment: 0.5, lastActivityAt: '2026-05-15T16:48:00Z', tags: ['suporte', 'resolvido'] },
];

export const SEED_INBOX_MESSAGES: InboxMessage[] = [
  // cv_1 Maria
  { id: 'msg_1', conversationId: 'cv_1', channel: 'whatsapp', direction: 'in', sender: 'Maria Aparecida', body: 'oi, queria saber se vocês atendem na rua do progresso, 412 — bairro centro de Bagé', timestamp: '2026-05-16T11:40:30Z' },
  { id: 'msg_2', conversationId: 'cv_1', channel: 'whatsapp', direction: 'out', sender: 'Bianca', body: 'Oi Maria! Já tô verificando aqui...', timestamp: '2026-05-16T11:40:48Z', isBot: true },
  { id: 'msg_3', conversationId: 'cv_1', channel: 'whatsapp', direction: 'out', sender: 'Bianca', body: 'Sim, atendemos sua rua com fibra. Tenho plano de 600 mega por R$ 99,90/mês, primeiros 3 meses por R$ 79,90. Posso reservar instalação ainda essa semana?', timestamp: '2026-05-16T11:42:00Z', isBot: true },
  // cv_4 Carla PJ
  { id: 'msg_4', conversationId: 'cv_4', channel: 'whatsapp', direction: 'in', sender: 'Carla Mendes', body: 'preciso de internet pra padaria nova, vai abrir semana que vem. POS Stone + wifi cliente. atendem comercial?', timestamp: '2026-05-16T08:20:00Z' },
  { id: 'msg_5', conversationId: 'cv_4', channel: 'whatsapp', direction: 'out', sender: 'Bianca', body: 'Que legal, parabéns pela abertura! Pra PJ comercial recomendo nosso plano 1 Gbps com IP fixo opcional. Quer que eu monte uma proposta?', timestamp: '2026-05-16T08:21:30Z', isBot: true },
  { id: 'msg_6', conversationId: 'cv_4', channel: 'whatsapp', direction: 'in', sender: 'Carla Mendes', body: 'sim! manda no email também: pao.quente@gmail.com', timestamp: '2026-05-16T08:28:00Z' },
  { id: 'msg_7', conversationId: 'cv_4', channel: 'email', direction: 'out', sender: 'Bianca', body: '[Email] Proposta — Plano PJ 1Gbps + Wi-Fi mesh — TexNet', timestamp: '2026-05-16T08:29:30Z', isBot: true, attachments: [{ name: 'proposta-pao-quente.pdf', type: 'file' }] },
  { id: 'msg_8', conversationId: 'cv_4', channel: 'whatsapp', direction: 'out', sender: 'Bianca', body: 'Perfeito, vou te mandar a proposta de PJ 1Gbps + Wi-Fi mesh no email agora.', timestamp: '2026-05-16T08:30:00Z', isBot: true },
];
