/**
 * Seed — Marketplace público.
 *
 * Skills, templates e integrações publicadas por workspaces — outros
 * podem instalar, com revenue share quando há valor monetário.
 */

export type ListingType = 'skill' | 'template' | 'integration' | 'workflow';
export type ListingPricing = 'free' | 'paid' | 'subscription' | 'revshare';

export interface MarketplacePublisher {
  id: string;
  name: string;
  workspaceId: string;
  verified: boolean;
  rating: number;
  publishedCount: number;
}

export interface MarketplaceListing {
  id: string;
  type: ListingType;
  title: string;
  slug: string;
  description: string;
  publisherId: string;
  publisherName: string;
  publisherVerified: boolean;
  pricing: ListingPricing;
  priceMonthly?: number;
  pricePerUse?: number;
  category: string;
  icon: string;
  rating: number;
  reviews: number;
  installs: number;
  installs30d: number;
  featured?: boolean;
  trending?: boolean;
  version: string;
  publishedAt: string;
  updatedAt: string;
}

export const SEED_MKT_PUBLISHERS: MarketplacePublisher[] = [
  { id: 'pub_thribus', name: 'Thribus Tech', workspaceId: 'ws_thribus', verified: true, rating: 4.8, publishedCount: 14 },
  { id: 'pub_texnet', name: 'TexNet Lab', workspaceId: 'ws_texnet', verified: true, rating: 4.6, publishedCount: 5 },
  { id: 'pub_aionics', name: 'Aionics Studio', workspaceId: 'ws_aionics', verified: true, rating: 4.7, publishedCount: 8 },
  { id: 'pub_indie_carlos', name: 'Carlos Buenos Aires', workspaceId: 'ws_indie_1', verified: false, rating: 4.2, publishedCount: 3 },
];

export const SEED_MKT_LISTINGS: MarketplaceListing[] = [
  { id: 'lst_1', type: 'skill', title: 'Negociação ISP — handle objeção de preço', slug: 'negociacao-isp-preco', description: 'Skill comprovada em 12k+ conversas. Reconhece objeção de preço, faz reframe de valor e oferece alternativas dentro da alçada.', publisherId: 'pub_thribus', publisherName: 'Thribus Tech', publisherVerified: true, pricing: 'paid', priceMonthly: 49, category: 'isp', icon: '💰', rating: 4.9, reviews: 38, installs: 218, installs30d: 41, featured: true, version: '2.3.1', publishedAt: '2026-02-10T00:00:00Z', updatedAt: '2026-05-10T15:00:00Z' },
  { id: 'lst_2', type: 'integration', title: 'Conector IXC completo (22 tools)', slug: 'ixc-completo', description: 'Acesso completo ao IXC — cliente, contrato, fatura, OS, agendamento, plano. Ideal pra agentes de provedores.', publisherId: 'pub_thribus', publisherName: 'Thribus Tech', publisherVerified: true, pricing: 'subscription', priceMonthly: 99, category: 'erp', icon: '🟦', rating: 4.7, reviews: 22, installs: 87, installs30d: 14, featured: true, version: '3.1.0', publishedAt: '2026-01-15T00:00:00Z', updatedAt: '2026-04-28T10:00:00Z' },
  { id: 'lst_3', type: 'template', title: 'Agente de Vendas ISP (Bianca clone)', slug: 'agente-vendas-isp', description: 'Template pronto: prompt + tools + skills + workflows. Plug-and-play pra qualquer provedor com IXC.', publisherId: 'pub_thribus', publisherName: 'Thribus Tech', publisherVerified: true, pricing: 'paid', priceMonthly: 199, category: 'isp', icon: '🤖', rating: 4.8, reviews: 14, installs: 42, installs30d: 8, trending: true, version: '1.4.0', publishedAt: '2026-03-22T00:00:00Z', updatedAt: '2026-05-12T09:00:00Z' },
  { id: 'lst_4', type: 'workflow', title: 'Recuperação de carrinho abandonado (e-commerce)', slug: 'recover-cart', description: 'Detecta lead que abandonou checkout, envia follow-up sequencial em 1h/24h/72h. Recupera 18% em média.', publisherId: 'pub_aionics', publisherName: 'Aionics Studio', publisherVerified: true, pricing: 'revshare', category: 'ecommerce', icon: '🛒', rating: 4.6, reviews: 19, installs: 134, installs30d: 22, version: '1.2.0', publishedAt: '2026-04-01T00:00:00Z', updatedAt: '2026-05-08T16:00:00Z' },
  { id: 'lst_5', type: 'skill', title: 'Triagem de tickets jurídicos', slug: 'triagem-juridica', description: 'Classifica ticket de cliente em categorias jurídicas (contrato, LGPD, trabalhista). Treinada com 800+ casos.', publisherId: 'pub_aionics', publisherName: 'Aionics Studio', publisherVerified: true, pricing: 'paid', priceMonthly: 79, category: 'juridico', icon: '⚖️', rating: 4.5, reviews: 11, installs: 28, installs30d: 5, version: '1.1.0', publishedAt: '2026-03-15T00:00:00Z', updatedAt: '2026-05-02T10:00:00Z' },
  { id: 'lst_6', type: 'integration', title: 'Pagar.me (PIX + boleto + cartão BR)', slug: 'pagarme-br', description: 'Adquirência brasileira — cobrança PIX instantâneo, boleto, cartão, antecipação de recebíveis.', publisherId: 'pub_thribus', publisherName: 'Thribus Tech', publisherVerified: true, pricing: 'free', category: 'payments', icon: '💳', rating: 4.6, reviews: 8, installs: 64, installs30d: 12, version: '2.0.0', publishedAt: '2026-02-28T00:00:00Z', updatedAt: '2026-05-01T11:00:00Z' },
  { id: 'lst_7', type: 'template', title: 'Agente clínica odontológica', slug: 'agente-clinica-odonto', description: 'Agente pra clínica — agendamento, lembrete, pós-procedimento. Integra com Doctoralia + Google Calendar.', publisherId: 'pub_indie_carlos', publisherName: 'Carlos Buenos Aires', publisherVerified: false, pricing: 'paid', priceMonthly: 89, category: 'saude', icon: '🦷', rating: 4.3, reviews: 7, installs: 19, installs30d: 4, version: '1.0.2', publishedAt: '2026-04-10T00:00:00Z', updatedAt: '2026-05-05T14:00:00Z' },
  { id: 'lst_8', type: 'skill', title: 'Detecção de fraude em pedidos', slug: 'fraud-detection', description: 'Pontua risco do pedido com base em padrão de comportamento + IP + histórico. Bloqueia ou pede aprovação.', publisherId: 'pub_aionics', publisherName: 'Aionics Studio', publisherVerified: true, pricing: 'revshare', category: 'ecommerce', icon: '🛡️', rating: 4.7, reviews: 16, installs: 52, installs30d: 10, trending: true, version: '2.1.0', publishedAt: '2026-03-08T00:00:00Z', updatedAt: '2026-05-09T12:00:00Z' },
  { id: 'lst_9', type: 'workflow', title: 'NPS pós-resolução automático', slug: 'nps-auto', description: 'Após ticket fechado, envia NPS em 24h. Score baixo escala pra CSM, alto pede review pública.', publisherId: 'pub_texnet', publisherName: 'TexNet Lab', publisherVerified: true, pricing: 'free', category: 'support', icon: '⭐', rating: 4.4, reviews: 12, installs: 81, installs30d: 18, version: '1.3.0', publishedAt: '2026-04-18T00:00:00Z', updatedAt: '2026-05-11T16:00:00Z' },
  { id: 'lst_10', type: 'integration', title: 'Geogrid — viabilidade ISP', slug: 'geogrid-viab', description: 'Consulta cobertura por CEP/endereço. Essencial pra provedor de internet vender só onde atende.', publisherId: 'pub_texnet', publisherName: 'TexNet Lab', publisherVerified: true, pricing: 'paid', priceMonthly: 39, category: 'isp', icon: '🗺️', rating: 4.8, reviews: 21, installs: 76, installs30d: 13, version: '1.5.0', publishedAt: '2026-02-12T00:00:00Z', updatedAt: '2026-04-22T09:00:00Z' },
];
