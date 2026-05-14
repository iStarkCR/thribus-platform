/**
 * Cortex Enterprise — Módulo Thribus BI.
 *
 * Status: COMING-SOON. Schema (cortex_bi_dashboards) está reservado pra
 * dashboards customizáveis com widgets de queries SQL/RAG.
 */

import type { ModuleDefinition } from './types.js';

export const biModule: ModuleDefinition = {
  id: 'bi',
  name: 'Thribus BI',
  slug: 'bi',
  description:
    'BI conectado nos dados do Cortex + dos sistemas do tenant. Dashboards customizáveis com widgets, queries SQL e insights gerados por IA.',
  category: 'analytics',
  version: '0.0.1',
  status: 'coming-soon',
  icon: 'BarChart3',
  tags: ['bi', 'dashboards', 'analytics'],
};
