/**
 * Seed marketing — anúncios in-app + showcase do Cortex Brain.
 */

export interface MarketingAd {
  id: string;
  variant: 'cortex' | 'integration' | 'trial' | 'promo' | 'event' | 'marketplace';
  badge?: string;
  title: string;
  subtitle: string;
  cta: string;
  ctaHref: string;
  accentColor: 'brand' | 'amber' | 'green' | 'red';
  expiresAt?: string;
}

export const SEED_ADS: MarketingAd[] = [
  {
    id: 'ad_cortex',
    variant: 'cortex',
    badge: 'Tecnologia proprietária',
    title: 'Cortex Brain — o motor por trás dos seus colaboradores',
    subtitle: 'Router multi-agente, memória persistente, RAG semântico, handoff zero-perda. Mesma plataforma que opera 15k+ conversas/mês na TexNet.',
    cta: 'Conhecer Cortex Brain',
    ctaHref: '/cortex',
    accentColor: 'brand',
  },
  {
    id: 'ad_billing',
    variant: 'integration',
    badge: 'Novo',
    title: 'Asaas + Stripe conectados',
    subtitle: 'Emita PIX, boleto, refunds direto do painel. Cliente paga, o agente confirma, tudo logado em audit trail. BR e internacional num lugar só.',
    cta: 'Ver Billing',
    ctaHref: '/billing',
    accentColor: 'green',
  },
  {
    id: 'ad_optimizer',
    variant: 'cortex',
    badge: 'Diferencial',
    title: 'Cortex economiza R$ 940/mês em IA na sua operação',
    subtitle: 'AI Cost Optimizer roda análise automática: troca de modelo, cache inteligente, compressão de prompt. Recomendações com economia quantificada.',
    cta: 'Rodar análise',
    ctaHref: '/optimizer',
    accentColor: 'amber',
  },
  {
    id: 'ad_trial',
    variant: 'trial',
    badge: '14 dias grátis',
    title: 'Convide um colega pra trial — dados sintéticos do setor dele',
    subtitle: 'Workspace isolado, conversas mock realistas, conversão 1-clique pra plano pago. Lead que testa converte 3-5x mais.',
    cta: 'Convidar pra trial',
    ctaHref: '/sandbox',
    accentColor: 'brand',
  },
  {
    id: 'ad_marketplace',
    variant: 'marketplace',
    badge: 'Marketplace',
    title: '21 integrações + 10 skills publicadas — instale em 1 clique',
    subtitle: 'IXC, HubSpot, Stripe, Asaas, Slack, Notion. Pacotes setoriais curados pra ISP, e-commerce, clínica.',
    cta: 'Explorar marketplace',
    ctaHref: '/marketplace',
    accentColor: 'brand',
  },
];

// ─── Cortex Brain Showcase ────────────────────────────────────────────────

export interface CortexCapability {
  id: string;
  icon: string;
  label: string;
  description: string;
}

export interface CortexMetric {
  id: string;
  label: string;
  value: string;
  baseline: string;
  improvement: string;
  positive: boolean;
}

export interface CortexComparison {
  metric: string;
  manual: string;
  cortex: string;
  delta: string;
}

export const CORTEX_CAPABILITIES: CortexCapability[] = [
  { id: 'cap_1', icon: '🧠', label: 'Router multi-agente', description: 'Classifica intent na 1ª msg, escolhe agente certo automaticamente' },
  { id: 'cap_2', icon: '📚', label: 'Memória persistente', description: 'Cada cliente tem perfil 360° com fatos memorizados ao longo do tempo' },
  { id: 'cap_3', icon: '🔍', label: 'RAG semântico nativo', description: 'Knowledge base com pgvector — agente lê seus docs e responde com base neles' },
  { id: 'cap_4', icon: '🤝', label: 'Handoff sem perda de contexto', description: 'Conversa muda de agente (vendas → suporte → retenção) mantendo histórico' },
  { id: 'cap_5', icon: '🧪', label: 'Eval suite em CI', description: 'Golden answers rodam antes de qualquer mudança subir — zero regressão' },
  { id: 'cap_6', icon: '💰', label: 'Cost optimizer automático', description: 'Recomenda troca de modelo, cache, compressão de prompt — quantifica economia' },
];

export const CORTEX_METRICS: CortexMetric[] = [
  { id: 'm_1', label: 'Custo por conversa', value: 'R$ 0,12', baseline: 'R$ 8,40 humano puro', improvement: '-98,6%', positive: true },
  { id: 'm_2', label: 'Tempo de resposta', value: '2.1min', baseline: '12min média setor', improvement: '-82,5%', positive: true },
  { id: 'm_3', label: 'Resolução automática', value: '91%', baseline: '47% chatbot tradicional', improvement: '+94%', positive: true },
  { id: 'm_4', label: 'ROI médio /agente', value: '14,5x', baseline: 'custo vs. receita atribuída', improvement: 'positivo', positive: true },
  { id: 'm_5', label: 'CSAT pós-atendimento', value: '4.3/5', baseline: '3.8/5 média', improvement: '+13%', positive: true },
  { id: 'm_6', label: 'Economia /mês operação', value: 'R$ 18,4k', baseline: 'vs. 4 atendentes 8h', improvement: '-87%', positive: true },
];

export const CORTEX_COMPARISON: CortexComparison[] = [
  { metric: 'Tempo de resposta (média)', manual: '12 min', cortex: '2.1 min', delta: '-82%' },
  { metric: 'Custo por conversa', manual: 'R$ 8,40', cortex: 'R$ 0,12', delta: '-98%' },
  { metric: 'Capacidade simultânea', manual: '1 conversa/atendente', cortex: '∞ paralelas', delta: '∞' },
  { metric: 'Horário de operação', manual: '8h–18h, dias úteis', cortex: '24/7/365', delta: '3,5x' },
  { metric: 'Custo fixo /mês (4 atendentes)', manual: 'R$ 21.000', cortex: 'R$ 2.600', delta: '-87%' },
  { metric: 'Erro humano', manual: '~8%', cortex: '<1%', delta: '-87%' },
  { metric: 'Setup pra escalar +50% volume', manual: '+2 contratações', cortex: '0 — automático', delta: '-100%' },
];
