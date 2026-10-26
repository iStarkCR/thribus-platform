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
 * Última verificação: 2026-10-26
 *  - Anthropic: Claude 5.5 / Opus 5 / Fable 5.1 (atuais) — IDs usam o ALIAS puro
 *    como snapshot canônico (sem date suffix). Modelos pré-5.5 ficam `hidden`:
 *    somem do dropdown de seleção mas continuam válidos p/ agentes já gravados.
 *  - OpenAI: documentação oficial gpt-5 family + gpt-4o family (inalterado)
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
  /** true = não aparece no dropdown de seleção, mas continua válido p/ agentes já gravados */
  hidden?: boolean;
}

/**
 * Lista de modelos disponíveis no dropdown, ordenados por relevância.
 * O PRIMEIRO Anthropic deve ser o recomendado (default em criação).
 */
export const MODEL_OPTIONS: ModelOption[] = [
  // ─── Anthropic ─────────────────────────────────────────────────────────────
  // ── Atuais (out/2026 — visíveis no dropdown) ──
  {
    id: 'claude-fable-5-1',
    label: 'claude-fable-5.1',
    badge: 'mais capaz',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-opus-5-5',
    label: 'claude-opus-5.5',
    badge: 'premium',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-opus-5',
    label: 'claude-opus-5',
    badge: 'premium (anterior)',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'claude-sonnet-5.5',
    badge: 'recomendado',
    provider: 'anthropic',
    verified: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'claude-haiku-5.5',
    badge: 'rápido',
    provider: 'anthropic',
    verified: true,
  },
  // ── Legacy (ocultos no dropdown; mantidos p/ compat de agentes já gravados) ──
  {
    id: 'claude-fable-5',
    label: 'claude-fable-5',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-opus-4-8',
    label: 'claude-opus-4-8',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'claude-sonnet-5',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'claude-haiku-4-5',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-opus-4-7',
    label: 'claude-opus-4-7',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'claude-opus-4-6',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'claude-sonnet-4-6',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'claude-sonnet-4-5',
    badge: 'legacy',
    provider: 'anthropic',
    verified: true,
    hidden: true,
  },
  // Notas de ID (referência oficial Anthropic /v1/models, out/2026):
  //  - Opus 5.5 (`claude-opus-5-5`) é o topo premium; Sonnet 5.5
  //    (`claude-sonnet-5-5`) é o combo velocidade/inteligência (default).
  //    Fable 5.1 (`claude-fable-5-1`) é o mais capaz/criativo.
  //  - IDs 5.x usam o ALIAS puro como snapshot canônico — NÃO adicionar date
  //    suffix (ex: `claude-sonnet-5-5`, nunca `claude-sonnet-5-5-2026xxxx`).
  //  - Legacy: `hidden: true` tira do dropdown de SELEÇÃO mas mantém no
  //    VALID_MODEL_IDS — agentes gravados no DB continuam válidos; remover
  //    quebraria o select na edição (cairia no default e regravaria).
  //  - Mythos 5 (`claude-mythos-5`) é invitation-only (Project Glasswing) — fora.

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  { id: 'gpt-5',       label: 'gpt-5',                        provider: 'openai', verified: true },
  { id: 'gpt-5-mini',  label: 'gpt-5-mini',  badge: 'rápido', provider: 'openai', verified: true },
  { id: 'gpt-5-nano',  label: 'gpt-5-nano',  badge: 'mais barato', provider: 'openai', verified: true },
  { id: 'gpt-4o',      label: 'gpt-4o',                       provider: 'openai', verified: true },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini',                  provider: 'openai', verified: true },
];

/** Default em criação de agente — recomendado atual. */
export const DEFAULT_MODEL: AIModel = 'claude-sonnet-5-5';

/**
 * Set de IDs válidos pra checagem rápida em runtime / migrations.
 * INCLUI os `hidden` de propósito — agentes/templates gravados com modelo
 * antigo continuam válidos; `hidden` só controla a VISIBILIDADE no dropdown.
 */
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

/**
 * Opções que aparecem no dropdown de SELEÇÃO. Esconde os `hidden`, mas garante
 * que `keepId` apareça mesmo se oculto — pra o select de EDIÇÃO não perder o
 * modelo atual do agente/template (senão o select fica sem option correspondente,
 * cai no default e regrava errado ao salvar).
 */
export function selectableModelOptions(keepId?: string | null): ModelOption[] {
  return MODEL_OPTIONS.filter((m) => !m.hidden || m.id === keepId);
}

/**
 * Agrupa opções por provedor — pra renderizar <optgroup>. Filtra os `hidden`.
 * Passe `keepId` nos selects de edição pra manter o modelo atual visível.
 */
export function groupedModelOptions(keepId?: string | null): Record<ModelProvider, ModelOption[]> {
  const visible = selectableModelOptions(keepId);
  return {
    anthropic: visible.filter((m) => m.provider === 'anthropic'),
    openai: visible.filter((m) => m.provider === 'openai'),
  };
}

/** Helper de label pra exibir "claude-sonnet-4-5 (recomendado)". */
export function modelLabel(opt: ModelOption): string {
  return opt.badge ? `${opt.label} (${opt.badge})` : opt.label;
}
