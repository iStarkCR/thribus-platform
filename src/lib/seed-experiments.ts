/**
 * Seed — A/B test de prompt.
 *
 * Dois (ou mais) prompts rodando em produção 50/50, com vencedor
 * automático após significância estatística.
 */

export type ExperimentStatus = 'draft' | 'running' | 'concluded' | 'archived';
export type WinnerDecision = 'A' | 'B' | 'tie' | 'pending';

export interface ExperimentVariant {
  id: string;
  label: 'A' | 'B' | string;
  promptVersionId: string;
  promptVersionLabel: string;
  trafficShare: number;
  exposures: number;
  successes: number;
  conversionRate: number;
  avgLatencyMs: number;
  avgCost: number;
}

export interface Experiment {
  id: string;
  agentId: string;
  agentName: string;
  workspaceId: string;
  name: string;
  hypothesis: string;
  primaryMetric: 'conversion' | 'csat' | 'first_response' | 'resolution_rate';
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  significance: number;
  winner: WinnerDecision;
  startedAt: string;
  endedAt?: string;
  durationDays: number;
  totalExposures: number;
}

export const SEED_EXPERIMENTS: Experiment[] = [
  {
    id: 'exp_1', agentId: 'agent_bianca', agentName: 'Bianca', workspaceId: 'ws_texnet',
    name: 'Cross-sell de combo TV no fechamento',
    hypothesis: 'Adicionar oferta de combo TV após "sim, quero o plano" aumenta ticket médio sem reduzir conversão.',
    primaryMetric: 'conversion',
    status: 'running',
    variants: [
      { id: 'v_1a', label: 'A', promptVersionId: 'pv_1', promptVersionLabel: 'v1.4.2 (atual)', trafficShare: 50, exposures: 412, successes: 91, conversionRate: 0.221, avgLatencyMs: 2_080, avgCost: 0.011 },
      { id: 'v_1b', label: 'B', promptVersionId: 'pv_2', promptVersionLabel: 'v1.5.0-rc1 (com cross-sell)', trafficShare: 50, exposures: 398, successes: 102, conversionRate: 0.256, avgLatencyMs: 2_140, avgCost: 0.012 },
    ],
    significance: 0.87,
    winner: 'pending',
    startedAt: '2026-05-09T10:00:00Z',
    durationDays: 7,
    totalExposures: 810,
  },
  {
    id: 'exp_2', agentId: 'agent_renata', agentName: 'Renata', workspaceId: 'ws_texnet',
    name: 'Empatia primeiro vs. diagnóstico primeiro',
    hypothesis: 'Começar com empatia em reclamação técnica eleva CSAT mesmo com pequeno aumento de latência.',
    primaryMetric: 'csat',
    status: 'concluded',
    variants: [
      { id: 'v_2a', label: 'A', promptVersionId: 'pv_3', promptVersionLabel: 'v2.0 (diagnóstico)', trafficShare: 50, exposures: 822, successes: 624, conversionRate: 0.759, avgLatencyMs: 1_980, avgCost: 0.010 },
      { id: 'v_2b', label: 'B', promptVersionId: 'pv_3b', promptVersionLabel: 'v2.1 (empatia)', trafficShare: 50, exposures: 814, successes: 692, conversionRate: 0.850, avgLatencyMs: 2_110, avgCost: 0.011 },
    ],
    significance: 0.98,
    winner: 'B',
    startedAt: '2026-04-15T00:00:00Z',
    endedAt: '2026-04-29T00:00:00Z',
    durationDays: 14,
    totalExposures: 1_636,
  },
  {
    id: 'exp_3', agentId: 'agent_marcos', agentName: 'Marcos', workspaceId: 'ws_texnet',
    name: 'Boleto + PIX vs. só PIX',
    hypothesis: 'Oferecer só PIX no follow-up de cobrança aumenta taxa de pagamento em 24h.',
    primaryMetric: 'resolution_rate',
    status: 'draft',
    variants: [
      { id: 'v_3a', label: 'A', promptVersionId: 'pv_m1', promptVersionLabel: 'Marcos v1.2 (boleto+pix)', trafficShare: 50, exposures: 0, successes: 0, conversionRate: 0, avgLatencyMs: 0, avgCost: 0 },
      { id: 'v_3b', label: 'B', promptVersionId: 'pv_m2', promptVersionLabel: 'Marcos v1.3 (só PIX)', trafficShare: 50, exposures: 0, successes: 0, conversionRate: 0, avgLatencyMs: 0, avgCost: 0 },
    ],
    significance: 0,
    winner: 'pending',
    startedAt: '2026-05-17T00:00:00Z',
    durationDays: 10,
    totalExposures: 0,
  },
];
