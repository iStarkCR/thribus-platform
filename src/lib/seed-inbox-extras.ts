/**
 * Seed extras — features avançadas da Inbox.
 * Intents, sugestões, notas internas, macros, traduções.
 */

export interface ConversationIntent {
  conversationId: string;
  primary: string;
  confidence: number;
  secondary?: string;
  detectedAt: string;
}

export interface SuggestedReply {
  id: string;
  conversationId: string;
  body: string;
  reasoning: string;
  confidence: number;
}

export interface ConversationAlert {
  id: string;
  conversationId: string;
  level: 'info' | 'warning' | 'critical';
  category: 'lgpd' | 'sla' | 'sentiment' | 'compliance' | 'churn';
  message: string;
  timestamp: string;
}

export interface ConversationSummary {
  conversationId: string;
  body: string;
  generatedAt: string;
  keyPoints: string[];
  nextAction: string;
}

export interface InternalNote {
  id: string;
  conversationId: string;
  authorName: string;
  body: string;
  mentions: string[];
  timestamp: string;
}

export interface MacroSnippet {
  id: string;
  shortcode: string;
  title: string;
  body: string;
  category: 'vendas' | 'suporte' | 'cobranca' | 'retencao' | 'geral';
  usage30d: number;
}

export interface TranslationToggle {
  conversationId: string;
  detectedLanguage: string;
  active: boolean;
}

export const SEED_INTENTS: ConversationIntent[] = [
  { conversationId: 'cv_1', primary: 'vendas — interesse em plano fibra', confidence: 0.94, secondary: 'consulta de viabilidade', detectedAt: '2026-05-16T11:40:30Z' },
  { conversationId: 'cv_2', primary: 'retenção — risco churn alto', confidence: 0.91, secondary: 'reclamação preço', detectedAt: '2026-05-16T09:22:00Z' },
  { conversationId: 'cv_3', primary: 'cobrança — boleto não recebido', confidence: 0.88, detectedAt: '2026-05-16T10:14:00Z' },
  { conversationId: 'cv_4', primary: 'vendas PJ — alta intenção', confidence: 0.96, secondary: 'cross-sell Wi-Fi mesh', detectedAt: '2026-05-16T08:30:00Z' },
];

export const SEED_SUGGESTIONS: SuggestedReply[] = [
  { id: 'sg_1', conversationId: 'cv_1', body: 'Maria, posso já reservar instalação pra sábado de manhã (que é sua preferência)? Confirmo data e horário pra você.', reasoning: 'Cliente em estágio de fechamento. Fato memorizado: prefere sábado. Próximo passo natural é agendar.', confidence: 0.89 },
  { id: 'sg_2', conversationId: 'cv_2', body: 'Aline, entendi sua frustração com a estabilidade. Antes de qualquer coisa, posso oferecer 30% off por 3 meses + agendar visita técnica gratuita pra revisar sua instalação. Topa tentar?', reasoning: 'Sentimento negativo + menção concorrente. Oferta de retenção autorizada para tier dela.', confidence: 0.84 },
  { id: 'sg_3', conversationId: 'cv_3', body: 'José, vou reenviar agora pelo email e WhatsApp pra garantir. Já cai na sua mão em alguns segundos.', reasoning: 'Cliente pediu confirmação. Boleto já existe no IXC — só precisa reenvio multi-canal.', confidence: 0.92 },
];

export const SEED_ALERTS: ConversationAlert[] = [
  { id: 'al_1', conversationId: 'cv_2', level: 'critical', category: 'churn', message: 'Risco de churn 87% — cliente mencionou Brisanet 2x', timestamp: '2026-05-16T09:22:00Z' },
  { id: 'al_2', conversationId: 'cv_2', level: 'warning', category: 'sentiment', message: 'Sentimento caiu de +0.2 → -0.3 nas últimas 3 msgs', timestamp: '2026-05-16T09:18:00Z' },
  { id: 'al_3', conversationId: 'cv_3', level: 'info', category: 'sla', message: 'Cliente aguardando resposta há 8min (SLA 10min)', timestamp: '2026-05-16T10:14:00Z' },
  { id: 'al_4', conversationId: 'cv_1', level: 'info', category: 'lgpd', message: 'Cliente mencionou CPF — confirmar finalidade do uso', timestamp: '2026-05-16T11:41:00Z' },
];

export const SEED_SUMMARIES: ConversationSummary[] = [
  { conversationId: 'cv_1', body: 'Maria pediu consulta de viabilidade pra rua do Progresso 412, Bagé. Cobertura confirmada. Bianca ofertou plano 600 mega R$ 99,90/mês com promo 3m R$ 79,90.', keyPoints: ['Endereço com cobertura fibra', 'Plano 600 mega ofertado', 'Promo 3m aplicada', 'Cliente trabalha home-office'], nextAction: 'Reservar instalação — preferência sábado manhã', generatedAt: '2026-05-16T11:42:00Z' },
  { conversationId: 'cv_2', body: 'Aline, cliente há 3 anos, sinalizou cancelamento. Mencionou Brisanet 2x na conversa. Reclamou de instabilidade. Carla assumiu de Bianca via handoff automático (sentiment < -0.4).', keyPoints: ['Cliente desde 02/2023', 'LTV R$ 5.2k', 'Menção concorrente: Brisanet', 'Sentimento caiu rápido', 'Handoff auto pra retenção'], nextAction: 'Oferecer 30% off 3m + visita técnica de revisão', generatedAt: '2026-05-16T09:22:00Z' },
];

export const SEED_NOTES: InternalNote[] = [
  { id: 'nt_1', conversationId: 'cv_2', authorName: 'Marcia Lopes', body: '@charles essa Aline já é a 3ª esse mês citando Brisanet. Temos que reavaliar preço da fidelidade no Centro de Bagé?', mentions: ['charles'], timestamp: '2026-05-16T09:25:00Z' },
  { id: 'nt_2', conversationId: 'cv_2', authorName: 'Charles Andrade', body: 'Concordo. Vou rodar uma análise no Power BI hoje. Por ora autorizei 35% off pra Aline.', mentions: [], timestamp: '2026-05-16T09:34:00Z' },
  { id: 'nt_3', conversationId: 'cv_4', authorName: 'Marcia Lopes', body: 'PJ alto valor — pedi pra Bianca já mandar PIX com 15% off à vista. Carla, fica de olho se ela aceitar boleto pra sair daqui rapidão.', mentions: ['carla'], timestamp: '2026-05-16T08:40:00Z' },
];

export const SEED_MACROS: MacroSnippet[] = [
  { id: 'm_1', shortcode: '/saudar', title: 'Saudação inicial', body: 'Oi {nome}! Sou a {agente} da TexNet. Em que posso te ajudar hoje?', category: 'geral', usage30d: 2_412 },
  { id: 'm_2', shortcode: '/promo3m', title: 'Promo 3 meses', body: 'Temos uma promoção especial: primeiros 3 meses com R$ 20 de desconto. Depois volta ao valor normal de R$ {valor}.', category: 'vendas', usage30d: 814 },
  { id: 'm_3', shortcode: '/reset', title: 'Pedido de reset roteador', body: 'Vou te pedir pra desligar o roteador da tomada, contar até 30 e religar. Me avisa quando voltar tudo aceso, ok?', category: 'suporte', usage30d: 1_240 },
  { id: 'm_4', shortcode: '/segviavw', title: 'Segunda via boleto', body: 'Já tô gerando a segunda via aqui. Vai chegar no seu email e WhatsApp em segundos. Confirma quando receber?', category: 'cobranca', usage30d: 612 },
  { id: 'm_5', shortcode: '/retencao30', title: 'Oferta retenção 30%', body: 'Antes de cancelar, posso te oferecer 30% de desconto pelos próximos 3 meses + uma visita técnica gratuita pra revisar sua instalação. Topa tentar?', category: 'retencao', usage30d: 124 },
  { id: 'm_6', shortcode: '/agendarinst', title: 'Agendamento de instalação', body: 'Beleza, {nome}! Tenho disponibilidade {data} pela manhã ou tarde. Qual prefere?', category: 'vendas', usage30d: 521 },
];

export const SEED_TRANSLATIONS: TranslationToggle[] = [
  { conversationId: 'cv_5', detectedLanguage: 'pt-BR', active: false },
];

export type InboxBoardLane = 'novo' | 'em_atendimento' | 'aguardando_cliente' | 'escalado' | 'fechado';

export const BOARD_LANES: { id: InboxBoardLane; label: string; color: string }[] = [
  { id: 'novo', label: 'Novo', color: 'bg-surface-3 text-creme-dim' },
  { id: 'em_atendimento', label: 'Em atendimento', color: 'bg-semantic-green/15 text-semantic-green' },
  { id: 'aguardando_cliente', label: 'Aguardando cliente', color: 'bg-semantic-amber/15 text-semantic-amber' },
  { id: 'escalado', label: 'Escalado', color: 'bg-semantic-red/15 text-semantic-red' },
  { id: 'fechado', label: 'Fechado', color: 'bg-surface-3 text-creme-faint' },
];

export const BOARD_MAPPING: Record<string, InboxBoardLane> = {
  cv_5: 'novo',
  cv_1: 'em_atendimento',
  cv_4: 'em_atendimento',
  cv_3: 'aguardando_cliente',
  cv_2: 'escalado',
  cv_6: 'fechado',
};
