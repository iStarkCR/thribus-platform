/**
 * Seed extras — features avançadas do Marketplace.
 * Bundles, earnings, reviews, packs setoriais, white-label.
 */

export interface MarketplaceBundle {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  listingIds: string[];
  totalPriceMonthly: number;
  bundlePriceMonthly: number;
  savingsPercent: number;
  installs: number;
  rating: number;
  featured?: boolean;
}

export interface PublisherEarnings {
  publisherId: string;
  publisherName: string;
  mrr: number;
  arr: number;
  paidInstalls: number;
  freeInstalls: number;
  churn30d: number;
  netNew30d: number;
  payoutsYTD: number;
  nextPayoutAt: string;
  nextPayoutAmount: number;
  topListings: { id: string; title: string; mrr: number; installs: number }[];
}

export interface ListingReview {
  id: string;
  listingId: string;
  authorName: string;
  authorVerified: boolean;
  rating: number;
  body: string;
  helpful: number;
  timestamp: string;
  publisherReply?: { body: string; timestamp: string };
}

export interface SectorPack {
  id: string;
  sector: string;
  sectorLabel: string;
  description: string;
  emoji: string;
  listingIds: string[];
  bundleSavings: number;
  installs: number;
  curatedBy: string;
}

export interface PrivateMarketplace {
  id: string;
  holdingName: string;
  workspaceCount: number;
  privateListings: number;
  publicListings: number;
  domain: string;
  brandColor: string;
}

export const SEED_BUNDLES: MarketplaceBundle[] = [
  {
    id: 'b_1', title: 'Pack ISP completo', description: 'Tudo que um provedor precisa: integração IXC + skill negociação + template Bianca + viabilidade Geogrid.',
    icon: '🌐', category: 'isp',
    listingIds: ['lst_1', 'lst_2', 'lst_3', 'lst_10'],
    totalPriceMonthly: 199 + 99 + 49 + 39,
    bundlePriceMonthly: 299,
    savingsPercent: 0.21, installs: 38, rating: 4.9, featured: true,
  },
  {
    id: 'b_2', title: 'Pack E-commerce conversão', description: 'Recuperação de carrinho + detecção fraude + skills de venda online.',
    icon: '🛒', category: 'ecommerce',
    listingIds: ['lst_4', 'lst_8'],
    totalPriceMonthly: 0,
    bundlePriceMonthly: 0,
    savingsPercent: 0, installs: 64, rating: 4.7, featured: true,
  },
  {
    id: 'b_3', title: 'Pack Cobrança BR', description: 'Pagar.me + skill cobrança amigável + workflow inadimplência.',
    icon: '💳', category: 'payments',
    listingIds: ['lst_6'],
    totalPriceMonthly: 0,
    bundlePriceMonthly: 39,
    savingsPercent: 0, installs: 21, rating: 4.5,
  },
];

export const SEED_PUBLISHER_EARNINGS: PublisherEarnings[] = [
  {
    publisherId: 'pub_thribus', publisherName: 'Thribus Tech',
    mrr: 2_847, arr: 34_164, paidInstalls: 87, freeInstalls: 144,
    churn30d: 3, netNew30d: 19,
    payoutsYTD: 11_240, nextPayoutAt: '2026-06-01T00:00:00Z', nextPayoutAmount: 2_412,
    topListings: [
      { id: 'lst_3', title: 'Agente Vendas ISP', mrr: 1_240, installs: 14 },
      { id: 'lst_2', title: 'Conector IXC', mrr: 891, installs: 9 },
      { id: 'lst_1', title: 'Negociação ISP', mrr: 716, installs: 41 },
    ],
  },
  {
    publisherId: 'pub_aionics', publisherName: 'Aionics Studio',
    mrr: 1_412, arr: 16_944, paidInstalls: 44, freeInstalls: 142,
    churn30d: 2, netNew30d: 11,
    payoutsYTD: 5_280, nextPayoutAt: '2026-06-01T00:00:00Z', nextPayoutAmount: 1_180,
    topListings: [
      { id: 'lst_4', title: 'Recuperação carrinho', mrr: 692, installs: 22 },
      { id: 'lst_8', title: 'Detecção fraude', mrr: 412, installs: 18 },
      { id: 'lst_5', title: 'Triagem jurídica', mrr: 308, installs: 4 },
    ],
  },
];

export const SEED_REVIEWS: ListingReview[] = [
  {
    id: 'rv_1', listingId: 'lst_1', authorName: 'TexNet — Marcia', authorVerified: true,
    rating: 5, body: 'Mudou completamente nossa retenção de clientes em risco de churn. A skill reconhece a objeção e oferece alternativa antes do cliente cancelar. Em 3 meses recuperamos 27 clientes.', helpful: 14, timestamp: '2026-04-22T10:00:00Z',
    publisherReply: { body: 'Marcia, obrigado pelo feedback! Adicionamos no v2.3 mais 2 templates de retenção pra ISP — confere no changelog.', timestamp: '2026-04-23T15:00:00Z' },
  },
  {
    id: 'rv_2', listingId: 'lst_1', authorName: 'Provedor X (anônimo)', authorVerified: false,
    rating: 4, body: 'Boa skill, mas precisa de mais exemplos pra mercado de baixa renda — o tom dela é muito corporativo.', helpful: 6, timestamp: '2026-05-02T14:00:00Z',
    publisherReply: { body: 'Boa observação! Vamos lançar variante "Bianca regional" no próximo update.', timestamp: '2026-05-03T09:00:00Z' },
  },
  {
    id: 'rv_3', listingId: 'lst_2', authorName: 'Aionics Studio', authorVerified: true,
    rating: 5, body: 'O conector mais completo de IXC que vi. 22 tools cobrem 95% dos casos. Documentação top.', helpful: 8, timestamp: '2026-04-15T11:00:00Z',
  },
  {
    id: 'rv_4', listingId: 'lst_4', authorName: 'Loja online — Pedro', authorVerified: true,
    rating: 5, body: 'Recuperou R$ 4.200 em carrinhos em 1 mês. Investimento pago no primeiro recovery.', helpful: 22, timestamp: '2026-04-30T16:00:00Z',
  },
];

export const SEED_SECTOR_PACKS: SectorPack[] = [
  { id: 'pk_isp', sector: 'isp', sectorLabel: 'ISP / Provedor de Internet', description: 'Tudo curado pra provedor — viabilidade, IXC, vendas, retenção.', emoji: '🌐', listingIds: ['lst_1', 'lst_2', 'lst_3', 'lst_10'], bundleSavings: 0.21, installs: 38, curatedBy: 'Thribus Tech' },
  { id: 'pk_ec', sector: 'ecommerce', sectorLabel: 'E-commerce', description: 'Recuperação de carrinho + detecção de fraude + funil otimizado.', emoji: '🛒', listingIds: ['lst_4', 'lst_8'], bundleSavings: 0, installs: 64, curatedBy: 'Aionics Studio' },
  { id: 'pk_juri', sector: 'juridico', sectorLabel: 'Jurídico / Compliance', description: 'Triagem, contratos, NDA, LGPD.', emoji: '⚖️', listingIds: ['lst_5'], bundleSavings: 0, installs: 12, curatedBy: 'Aionics Studio' },
  { id: 'pk_saude', sector: 'saude', sectorLabel: 'Saúde / Clínicas', description: 'Agendamento, lembrete, pós-procedimento, faturamento convênio.', emoji: '🦷', listingIds: ['lst_7'], bundleSavings: 0, installs: 19, curatedBy: 'Carlos Buenos Aires' },
];

export const SEED_PRIVATE_MARKETPLACES: PrivateMarketplace[] = [
  { id: 'pm_holding_telecom', holdingName: 'Holding Telecom Sul', workspaceCount: 12, privateListings: 8, publicListings: 47, domain: 'marketplace.telecomsul.com.br', brandColor: '#0066CC' },
];
