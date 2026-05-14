/**
 * Cortex Enterprise — Module System.
 *
 * Cada módulo (Contratos, Propostas, Talki, BI) implementa essa interface.
 * O registry monta as rotas em /cortex/modules/<id>/* automaticamente.
 */

import type { Router } from 'express';

export type ModuleStatus = 'stable' | 'beta' | 'preview' | 'coming-soon';

export interface ModuleDefinition {
  /** ID estável — usado nas rotas e no DB. */
  id: string;
  /** Nome humano (Contratos, Propostas, Talki, Thribus BI…). */
  name: string;
  /** Slug em pt-BR pra UI. */
  slug: string;
  /** Descrição curta — usada no painel. */
  description: string;
  /** Categoria (sales, ops, comms, analytics…). */
  category: 'sales' | 'ops' | 'comms' | 'analytics' | 'finance';
  /** Versão semântica. */
  version: string;
  /** Status do módulo — quem tá em preview/coming-soon avisa na UI. */
  status: ModuleStatus;
  /** Ícone (nome do componente lucide-react no frontend). */
  icon: string;
  /**
   * Constrói o Router Express com endpoints do módulo.
   * Pode ser undefined se o módulo é só vitrine (coming-soon).
   */
  buildRouter?: () => Router;
  /** Tags livres (ex: ["assinatura", "contratos", "compliance"]). */
  tags?: string[];
}

export interface InstalledModule {
  moduleId: string;
  tenantId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: string;
}
