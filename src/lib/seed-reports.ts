/**
 * Seed — Reports executivos automáticos.
 *
 * Cada workspace pode agendar relatórios recorrentes (semanal/mensal)
 * gerados pelo agente. KPIs, objeções top, leads quentes, alertas.
 */

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ReportChannel = 'email' | 'slack' | 'pdf' | 'whatsapp';

export interface ReportSchedule {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  frequency: ReportFrequency;
  nextRunAt: string;
  channels: ReportChannel[];
  recipients: string[];
  sections: string[];
  enabled: boolean;
  lastSentAt?: string;
}

export interface ReportRun {
  id: string;
  scheduleId: string;
  scheduleName: string;
  workspaceName: string;
  generatedAt: string;
  status: 'sent' | 'failed' | 'preview';
  recipientsCount: number;
  highlights: string[];
  kpis: { label: string; value: string; trend: number }[];
  alerts: string[];
}

export const SEED_REPORT_SCHEDULES: ReportSchedule[] = [
  { id: 'rs_1', workspaceId: 'ws_texnet', workspaceName: 'TexNet', name: 'Executivo semanal — TexNet', frequency: 'weekly', nextRunAt: '2026-05-18T11:00:00Z', channels: ['email', 'pdf'], recipients: ['ceo@texnet.com.br', 'comercial@texnet.com.br'], sections: ['kpis', 'top_objecoes', 'leads_quentes', 'churn_risk', 'alertas_sla'], enabled: true, lastSentAt: '2026-05-11T11:00:00Z' },
  { id: 'rs_2', workspaceId: 'ws_texnet', workspaceName: 'TexNet', name: 'Mensal completo — comercial', frequency: 'monthly', nextRunAt: '2026-06-01T09:00:00Z', channels: ['email', 'pdf', 'slack'], recipients: ['ceo@texnet.com.br', 'cfo@texnet.com.br', '#executivo'], sections: ['kpis', 'cohort_retencao', 'cost_breakdown', 'roi_agentes', 'roadmap_skills'], enabled: true, lastSentAt: '2026-05-01T09:00:00Z' },
  { id: 'rs_3', workspaceId: 'ws_texnet', workspaceName: 'TexNet', name: 'Diário operacional — suporte', frequency: 'daily', nextRunAt: '2026-05-17T08:00:00Z', channels: ['slack'], recipients: ['#suporte-daily'], sections: ['tickets_abertos', 'sla_status', 'tools_falhando'], enabled: true, lastSentAt: '2026-05-16T08:00:00Z' },
  { id: 'rs_4', workspaceId: 'ws_thribus', workspaceName: 'Thribus Tech', name: 'CEO Brief — Charles', frequency: 'weekly', nextRunAt: '2026-05-19T07:00:00Z', channels: ['whatsapp', 'email'], recipients: ['+5553999999999', 'developer@thribus.com.br'], sections: ['kpis', 'top_objecoes', 'novos_clientes', 'pipeline_b2b'], enabled: true, lastSentAt: '2026-05-12T07:00:00Z' },
];

export const SEED_REPORT_RUNS: ReportRun[] = [
  {
    id: 'rr_1', scheduleId: 'rs_1', scheduleName: 'Executivo semanal — TexNet', workspaceName: 'TexNet',
    generatedAt: '2026-05-11T11:00:00Z', status: 'sent', recipientsCount: 2,
    highlights: [
      'Bianca fechou R$ 87,4k em vendas — recorde da operação',
      'Carla recuperou 11 clientes de churn (vs. 3 semana anterior)',
      'Renata teve 8.2k conversas com 91% resolução automática',
    ],
    kpis: [
      { label: 'Vendas atribuídas', value: 'R$ 87.4k', trend: 0.18 },
      { label: 'Conversas totais', value: '15.4k', trend: 0.04 },
      { label: 'CSAT', value: '4.1/5', trend: -0.06 },
      { label: 'Custo total', value: 'US$ 891', trend: -0.08 },
    ],
    alerts: [
      'CSAT abaixo do target (4.2) por 2ª semana — investigar reclamações Renata',
      '3 tools com taxa erro > 5% — atenção ixc_alterar_plano',
    ],
  },
  {
    id: 'rr_2', scheduleId: 'rs_3', scheduleName: 'Diário operacional — suporte', workspaceName: 'TexNet',
    generatedAt: '2026-05-16T08:00:00Z', status: 'sent', recipientsCount: 1,
    highlights: [
      '218 tickets fechados ontem (média 9.8min resolução)',
      '12 escalações abertas — 2 acima SLA 2h',
      'Tool ixc_consulta_cliente: 99.4% sucesso',
    ],
    kpis: [
      { label: 'Tickets fechados', value: '218', trend: 0.07 },
      { label: 'SLA cumprido', value: '94%', trend: -0.02 },
      { label: 'Tempo médio', value: '9.8min', trend: -0.04 },
    ],
    alerts: ['2 escalações > 2h aguardando humano'],
  },
  {
    id: 'rr_3', scheduleId: 'rs_4', scheduleName: 'CEO Brief — Charles', workspaceName: 'Thribus Tech',
    generatedAt: '2026-05-12T07:00:00Z', status: 'sent', recipientsCount: 2,
    highlights: [
      'MRR Thribus: US$ 3.4k (+12% MoM)',
      'Pipeline B2B com 4 deals em proposta (~ R$ 78k ARR)',
      'CORTEX teve 1.2k novos usuários semana',
    ],
    kpis: [
      { label: 'MRR', value: 'US$ 3.4k', trend: 0.12 },
      { label: 'ARR potencial', value: 'R$ 78k', trend: 0.21 },
      { label: 'Pipeline deals', value: '4', trend: 0.33 },
    ],
    alerts: ['Stripe webhook falhou 1x — investigar antes próxima cobrança'],
  },
];
