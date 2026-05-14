/**
 * Cortex Brain — barrel + bootstrap.
 *
 * Uso no index.ts do worker:
 *   import { mountCortex } from './cortex/index.js';
 *   mountCortex(app);
 */

import type { Express } from 'express';
import { loadBuiltInAgents, agentRegistry } from './agents/registry.js';
import { createCortexRouter } from './inject/rest.js';
import { startConsolidationWorker } from './memory/consolidation.js';

export function mountCortex(app: Express): void {
  loadBuiltInAgents();
  agentRegistry.logInventory();
  app.use('/cortex', createCortexRouter());
  if (process.env.CORTEX_CONSOLIDATION_DISABLED !== '1') {
    startConsolidationWorker();
  }
  console.log('[cortex] mounted at /cortex');
}

export { agentRegistry } from './agents/registry.js';
export { orchestrate } from './brain/orchestrator.js';
export { longTermMemory } from './memory/long-term.js';
export { semanticMemory } from './memory/semantic.js';
export { shortTermMemory } from './memory/short-term.js';
export { snapshot as metricsSnapshot } from './observability/metrics.js';
export { generateApiKey } from './tenancy/store.js';
export type {
  AnalyzeRequest,
  AnalyzeResponse,
  BrainAction,
  BrainInsight,
  CortexMessage,
  CortexSession,
  EntityRef,
  TenantContext,
} from './types.js';
