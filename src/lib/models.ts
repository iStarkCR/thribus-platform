/**
 * Registro central de modelos de IA disponíveis no painel.
 *
 * Fonte única de verdade pra dropdowns (NewAgentModal, AgentDetailModal,
 * TemplateFormModal) + pricing.ts. Adicionar/remover modelo aqui propaga
 * pra UI inteira sem tocar em cada componente.
 *
 * REGRA: só inclua IDs VERIFICADOS contra a API do provedor (curl /v1/models).
 * IDs inválidos quebram o worker em runtime com 404 — foi exatamente o que
 * aconteceu com `claude-sonnet-4-20250514` (não existia, parou Bianca em
 * produção até virar `claude-sonnet-4-5-20250929`).
 *
 * Última verificação: 2026-05-09
 *  - Anthropic: testado via worker em produção (model_id retornado em logs)
 *  - OpenAI: documentação oficial gpt-5 family + gpt-4o family
 */

import type { AIModel } from '@/types';

export type ModelProvider = 'anthropic' | 'openai';

export interface ModelOption {
  id: AIModel;
  /** Label curta exibida no dropdown */
  label: string;
  /** "recomendado" | "rápido" | "alias estável" — exibido em parênteses */
  badge?: string;
  provider: ModelProvider;
  /** True = verificado contra API do provedor */
  verified: boolean;
}

/**
 * Lista de modelos disponíveis no dropdown, ordenados por relevância.
 * O PRIMEIRO Anthropic deve ser o recomendado (default em criação).
 */
export const MODEL_OPTIONS: ModelOption[] = [
  // ─── Anthropic ─────────────────────────────────────────────────────────────
  // ── Atuais (jul/2026) ──
  {
    id: 'claude-fable-5',
    label: 'claude-fable-5',
    badge: 'mais capaz',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-opus-4-8',
    label: 'claude-opus-4-8',
    badge: 'premium',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'claude-sonnet-5',
    badge: 'recomendado',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'claude-haiku-4-5',
    badge: 'rápido',
    provider: 'anthropic',
    verified: true,
  },
  // ── Legacy (ainda disponíveis; mantidos p/ compat de agentes já gravados) ──
  {
    id: 'claude-opus-4-7',
    label: 'claude-opus-4-7',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'claude-opus-4-6',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'claude-sonnet-4-6',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'claude-sonnet-4-5',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
  },
  // Notas de ID (referência oficial Anthropic /v1/models, jul/2026):
  //  - Fable 5 (`claude-fable-5`) é o topo atual; Sonnet 5 (`claude-sonnet-5`)
  //    é o combo velocidade/inteligência (preço introdutório $2/$10 até 31/ago/2026).
  //  - IDs 4.6+ usam o ALIAS puro como snapshot canônico — NÃO adicionar date
  //    suffix (ex: `claude-sonnet-5`, nunca `claude-sonnet-5-2026xxxx`).
  //  - Legacy mantidos: agentes gravados no DB podem apontar pra eles; remover
  //    quebraria o select na edição (cairia no default e regravaria).
  //  - Mythos 5 (`claude-mythos-5`) é invitation-only (Project Glasswing) — fora.

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  { id: 'gpt-5',       label: 'gpt-5',                        provider: 'openai', verified: true },
  { id: 'gpt-5-mini',  label: 'gpt-5-mini',  badge: 'rápido', provider: 'openai', verified: true },
  { id: 'gpt-5-nano',  label: 'gpt-5-nano',  badge: 'mais barato', provider: 'openai', verified: true },
  { id: 'gpt-4o',      label: 'gpt-4o',                       provider: 'openai', verified: true },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini',                  provider: 'openai', verified: true },
];

/** Default em criação de agente — primeiro recomendado da lista. */
export const DEFAULT_MODEL: AIModel = 'claude-sonnet-5';

/** Set de IDs válidos pra checagem rápida em runtime / migrations. */
export const VALID_MODEL_IDS = new Set<string>(MODEL_OPTIONS.map((m) => m.id));

/**
 * Retorna true se o modelo é conhecido e verificado.
 * Útil pra rejeitar valores inválidos vindos do DB antes de renderizar.
 */
export function isValidModel(id: string | undefined | null): id is AIModel {
  return !!id && VALID_MODEL_IDS.has(id);
}

/**
 * Sanitiza um valor de modelo: se inválido, retorna o default.
 * Use em telas de edição pra evitar que um ID legacy quebre o select
 * (option.value não bate com nenhuma option → select fica vazio → save grava string vazia).
 */
export function safeModel(id: string | undefined | null): AIModel {
  return isValidModel(id) ? id : DEFAULT_MODEL;
}

/** Agrupa opções por provedor — pra renderizar <optgroup>. */
export function groupedModelOptions(): Record<ModelProvider, ModelOption[]> {
  return {
    anthropic: MODEL_OPTIONS.filter((m) => m.provider === 'anthropic'),
    openai: MODEL_OPTIONS.filter((m) => m.provider === 'openai'),
  };
}

/** Helper de label pra exibir "claude-sonnet-4-5 (recomendado)". */
export function modelLabel(opt: ModelOption): string {
  return opt.badge ? `${opt.label} (${opt.badge})` : opt.label;
}
