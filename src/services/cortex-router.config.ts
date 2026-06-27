/**
 * Cortex Router — config (thresholds + sinais + perfis).
 *
 * Tudo que é DADO de calibragem (números de corte e regex por tier) mora aqui,
 * fora da lógica de `route()`. A função de roteamento não tem número/regex mágico
 * no meio — ela lê destas constantes nomeadas. Recalibrar = mexer só neste arquivo.
 *
 * Dois perfis:
 *   - 'whatsapp' : porta 1:1 a heurística do daemon (cortexBrain() em
 *     Bukowiski/daemon/server.js) — mesmos tiers, mesmos thresholds, mesmas regex.
 *   - 'painel'   : STUB explícito (Fase 1). Será recalibrado na Fase 2 com os
 *     números da análise do Codd. Por ora roteia tudo no default.
 */

import type { CortexModel, CortexEffort } from './cortexBrain';

export type RouterProfileId = 'whatsapp' | 'painel';

/** Tiers de complexidade, do mais leve ao mais pesado. */
export type Tier = 'trivial' | 'médio' | 'complexo' | 'crítico' | 'máximo';

/**
 * Resultado da CLASSIFICAÇÃO por complexidade (antes dos refinamentos).
 * Os refinamentos — sticky, imagem→sonnet, override — são aplicados por cima
 * disso dentro de `route()`, não aqui.
 */
export interface Classification {
  tier: Tier;
  model: CortexModel;
  effort: CortexEffort | null;
  reason: string;
}

/**
 * Hierarquia de modelos pro STICKY MODEL: dentro de uma conversa o modelo só
 * SOBE, nunca desce (trocar invalida o prompt cache). fable/claude-opus-4-7
 * ficam fora do automático → caem no `DEFAULT_RANK` (sonnet), idêntico ao
 * `MODEL_RANK[x] ?? 1` do daemon.
 */
export const MODEL_RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2 };
export const DEFAULT_RANK = 1;

/** Imagem precisa de visão decente — nunca roda em haiku; piso é sonnet. */
export const VISION_FLOOR_MODEL: CortexModel = 'sonnet';

// ─── Perfil WhatsApp — calibragem 1:1 do daemon ─────────────────────────────

/** Thresholds de comprimento (em chars do texto já trimado). */
export const WHATSAPP_LENGTH = {
  /** len <= trivialMax → trivial ('curta'), sem nem olhar o conteúdo. */
  trivialMax: 12,
  /** Saudação/confirmação só conta como trivial até este tamanho. */
  trivialGreetingMax: 40,
  /** len > maximo → tier máximo (texto muito longo). */
  maximo: 900,
  /** len > complex → tier complexo (texto longo). */
  complex: 400,
  /** len > complexDense → vira crítico (denso) em vez de complexo. */
  complexDense: 600,
} as const;

/** Sinais (regex) por tier — portados caractere a caractere do daemon. */
export const WHATSAPP_SIGNALS = {
  trivial:
    /^(oi+|ol[aá]|opa|e[ -]?a[íi]|fala|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|vlw|ok|okay|blz|beleza|t[aá]|certo|show|massa|👍|🙏|kk+|h[ae]h[ae]|teste?|ping|quem [eé]|qual seu nome|tudo bem|sim|n[aã]o|claro)\b/i,
  maximo:
    /\b(estrat[eé]gi|arquitet|trade.?off|pr[oó]s e contras|decis[aã]o|roadmap|posicionament|vis[aã]o de (produto|neg[oó]cio)|aprofund|an[aá]lise profunda|compar.*(recomend|melhor opç)|plano (completo|de a[çc][aã]o))/i,
  complex:
    /\b(analis|compar|refator|debug|investig|diagn[oó]stic|otimiz|planej|avali|implement|c[oó]digo|script|migra[çc]|porqu[eê]|raz[aã]o por|explica por|passo a passo|detalha|revis|auditori|propost|or[çc]ament|c[aá]lcul|proje[çc][aã]o|cen[aá]rio|m[uú]ltipl|recomend|query|sql|schema|consulta no banco)/i,
} as const;

/**
 * Classificador WhatsApp — réplica exata de `cortexBrain()` do daemon:
 *   trivial  → haiku           (saudação/confirmação ou texto curtíssimo)
 *   médio    → sonnet          (default, dia a dia)
 *   complexo → opus · high     (raciocínio, código, análise, debug)
 *   crítico  → opus · xhigh    (o mesmo, porém denso/longo)
 *   máximo   → opus · max      (estratégia/arquitetura/decisão, ou muito longo)
 */
export function classifyWhatsapp(text: string): Classification {
  const raw = (text || '').trim();
  const t = raw.toLowerCase();
  const len = raw.length;
  const L = WHATSAPP_LENGTH;
  const S = WHATSAPP_SIGNALS;

  // trivial → haiku
  if (len <= L.trivialMax || (S.trivial.test(t) && len <= L.trivialGreetingMax)) {
    return {
      tier: 'trivial',
      model: 'haiku',
      effort: null,
      reason: len <= L.trivialMax ? 'curta' : 'saudação/confirmação',
    };
  }

  // máximo → opus · max
  if (S.maximo.test(t) || len > L.maximo) {
    return {
      tier: 'máximo',
      model: 'opus',
      effort: 'max',
      reason: len > L.maximo ? 'muito longa' : 'estratégico/profundo',
    };
  }

  // complexo/crítico → opus (esforço sobe com o tamanho)
  if (S.complex.test(t) || len > L.complex) {
    const dense = len > L.complexDense;
    return {
      tier: dense ? 'crítico' : 'complexo',
      model: 'opus',
      effort: dense ? 'xhigh' : 'high',
      reason: len > L.complex ? 'longa' : 'raciocínio',
    };
  }

  // médio → sonnet (default)
  return { tier: 'médio', model: 'sonnet', effort: null, reason: 'default' };
}

// ─── Perfil Painel — STUB (Fase 1) ──────────────────────────────────────────
//
// NÃO copiamos os thresholds do WhatsApp aqui de propósito: o tráfego do painel
// tem outra distribuição (mensagens mais longas e estruturadas), então calibrar
// com a régua do zap roteia errado. Fica como placeholder consciente: tudo no
// default (médio → sonnet). A Fase 2 substitui isto pela curva real do Codd.

/** Marca explícita de que o perfil painel ainda é placeholder. */
export const PAINEL_IS_STUB = true;

export function classifyPainel(_text: string): Classification {
  // TODO(Fase 2): substituir pela heurística calibrada com a análise do Codd.
  return {
    tier: 'médio',
    model: 'sonnet',
    effort: null,
    reason: 'painel-stub: roteamento não calibrado (Fase 2)',
  };
}

// ─── Tabela de perfis ───────────────────────────────────────────────────────

export interface RouterProfile {
  id: RouterProfileId;
  classify: (text: string) => Classification;
  /** true = heurística ainda é placeholder (não calibrada). */
  stub: boolean;
}

export const PROFILES: Record<RouterProfileId, RouterProfile> = {
  whatsapp: { id: 'whatsapp', classify: classifyWhatsapp, stub: false },
  painel: { id: 'painel', classify: classifyPainel, stub: true },
};

export const DEFAULT_PROFILE: RouterProfileId = 'whatsapp';
