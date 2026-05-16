/**
 * Cortex Enterprise — Module Registry.
 *
 * Built-in modules são registrados no boot. Cada um pode expor um Router
 * Express que é montado em /cortex/modules/<id>/*.
 *
 * Tenant precisa ter o módulo "instalado" em cortex_modules (tabela)
 * pra acessar — endpoint admin permite habilitar/desabilitar.
 */

import { Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';
import { buildContractsRouter, contractsModule } from './contracts.js';
import { buildProposalsRouter, proposalsModule } from './proposals.js';
import { biModule } from './bi.js';
import { buildTalkiRouter, talkiRuntimeModule } from './talki-runtime.js';
import { buildCrmRouter, crmModule } from './crm.js';
import { buildTicketsRouter, ticketsModule } from './tickets.js';
import { billingBrModule, buildBillingBrRouter } from './billing-br.js';
import { buildKbRouter, kbModule } from './knowledge-base.js';
import type { InstalledModule, ModuleDefinition } from './types.js';

const logger = createLogger('cortex.modules');

class ModuleRegistry {
  private modules = new Map<string, ModuleDefinition>();

  register(def: ModuleDefinition): void {
    if (this.modules.has(def.id)) {
      logger.warn('overwriting module', { moduleId: def.id });
    }
    this.modules.set(def.id, def);
  }

  get(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  list(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  buildAllRoutes(): Router {
    const root = Router();
    for (const def of this.modules.values()) {
      if (def.buildRouter) {
        root.use(`/${def.id}`, def.buildRouter());
        logger.info('module mounted', { moduleId: def.id, path: `/cortex/modules/${def.id}` });
      }
    }
    return root;
  }

  logInventory(): void {
    const list = this.list();
    const summary = list
      .map((m) => `${m.id}(${m.status})`)
      .join(', ');
    logger.info('modules registered', { count: list.length, modules: summary });
  }
}

export const moduleRegistry = new ModuleRegistry();

export function loadBuiltInModules(): void {
  // Módulos com runtime real
  moduleRegistry.register({ ...contractsModule, buildRouter: buildContractsRouter });
  moduleRegistry.register({ ...proposalsModule, buildRouter: buildProposalsRouter });
  // Talki agora com runtime (M1)
  moduleRegistry.register({ ...talkiRuntimeModule, buildRouter: buildTalkiRouter });
  // M2 — módulos B2B core
  moduleRegistry.register({ ...crmModule, buildRouter: buildCrmRouter });
  moduleRegistry.register({ ...ticketsModule, buildRouter: buildTicketsRouter });
  moduleRegistry.register({ ...billingBrModule, buildRouter: buildBillingBrRouter });
  moduleRegistry.register({ ...kbModule, buildRouter: buildKbRouter });
  // BI continua coming-soon (M3+)
  moduleRegistry.register(biModule);
}

// ─── Helpers DB pra módulos instalados por tenant ──────────────────────────

export async function listInstalledModules(
  tenantId: string,
): Promise<InstalledModule[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('cortex_modules')
      .select('module_id, tenant_id, enabled, config, installed_at')
      .eq('tenant_id', tenantId);
    if (error) {
      if (error.code === '42P01') return [];
      logger.warn('listInstalledModules error', { error: error.message });
      return [];
    }
    return (data ?? []).map((r) => ({
      moduleId: r.module_id,
      tenantId: r.tenant_id,
      enabled: r.enabled,
      config: r.config ?? {},
      installedAt: r.installed_at,
    }));
  } catch (err) {
    logger.warn('listInstalledModules ex', { error: (err as Error).message });
    return [];
  }
}

export async function installModule(
  tenantId: string,
  moduleId: string,
  config: Record<string, unknown> = {},
): Promise<boolean> {
  if (!supabase) return false;
  if (!moduleRegistry.get(moduleId)) return false;

  const { error } = await supabase
    .from('cortex_modules')
    .upsert(
      {
        tenant_id: tenantId,
        module_id: moduleId,
        enabled: true,
        config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,module_id' },
    );
  if (error) {
    logger.warn('installModule error', { error: error.message });
    return false;
  }
  return true;
}

export async function disableModule(
  tenantId: string,
  moduleId: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('cortex_modules')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId);
  return !error;
}
