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
 *   - 'painel'   : calibrado na Fase 2 com a análise de uso real do Codd. Gate
 *     primário pelo SINAL DE CONTEÚDO (curto-mas-pesado → Opus); tamanho só
 *     escala o esforço. Validado por replay offline (scripts/cortex-router-replay.mjs).
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
 * SOBE, nunca desce (trocar invalida o prompt cache). fable fica fora do
 * roteamento automático → cai no `DEFAULT_RANK` (sonnet), idêntico ao
 * `MODEL_RANK[x] ?? 1` do daemon.
 */
export const MODEL_RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 };
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

// ─── Perfil Painel — Fase 3: sonnet como cavalo de batalha ──────────────────
//
// A Fase 2 (qualquer sinal pesado → Opus) queimava a janela de 5h: mensagens
// cotidianas de trabalho ("analisa", "query", "debug") caíam TODAS em opus, e
// opus virou 59% do consumo. A Fase 3 mantém o gate por SINAL (não por tamanho),
// mas re-mapeia os tiers pra escalar o ESFORÇO do sonnet antes de trocar de modelo:
//   trivial  → haiku          len<=40 + só sinal leve, SEM sinal pesado
//   médio    → sonnet · medium default (conversa/pergunta do dia a dia)
//   complexo → sonnet · high   um sinal pesado, ou texto longo estruturado
//   crítico  → sonnet · max    denso: 2+ sinais, bloco de código, ou pesado+longo
//   máximo   → opus            SÓ dev pesado ou estratégico de verdade; esforço
//                              escala medium→max com a densidade. Esforço xhigh/max
//                              exige AUTORIZAÇÃO do Charles (a ponte pergunta antes).
//   fable    → pedido EXPLÍCITO ("usa o fable", "modo ultra"); >medium também
//              exige autorização.
// DESEMPATE: pesado vence leve. Tamanho não rebaixa pesado, só escala o esforço.

/** Thresholds de comprimento do painel (chars do texto trimado). */
export const PAINEL_LENGTH = {
  /** len <= trivialMax + só sinal leve + sem pesado → trivial (haiku). */
  trivialMax: 60,
  /** len >= complex (sem sinal pesado) → complexo (escalada por tamanho puro). */
  complex: 550,
  /** Pesado + len > dense → denso (escala o esforço, não o modelo). */
  dense: 750,
  /** Sem pesado, len > heavy → crítico (texto muito longo sem sinal). */
  heavy: 1100,
  /** len > maximo → contribui pro tier máximo (com substância junto). */
  maximo: 1800,
} as const;

/**
 * Sinais de conteúdo do painel. PESADOS empurram pra Opus; LEVES só liberam o
 * trivial. Cada chave PESADA conta como UM "sinal" para a regra de 2+ sinais.
 */
export const PAINEL_SIGNALS = {
  /** Bloco de código cercado por crase tripla — sinal pesado e gatilho de crítico. */
  code: /```/,
  heavy: {
    sql: /\b(select|insert|update|delete|create\s+table|alter\s+table|drop\s+table)\b/i,
    // path: começa em / (opcionalmente ~ ou . antes) com 2 segmentos, OU extensão de arquivo.
    path: /(^|\s)(~|\.{1,2})?\/[\w.-]+\/[\w.-]+|\.(ts|tsx|jsx?|mjs|cjs|sql|env|json|ya?ml|sh|py|md)\b/i,
    // chamada de função: foo() vazio ou foo(a, b)/foo(x=1) com args — evita "cliente(s)".
    fn: /\b[a-z_][\w.]*\(\s*\)|\b[a-z_][\w.]*\([^)]*[,;=][^)]*\)/i,
    nouns:
      /\b(rls|schema|migration|migrations|daemon|supabase|endpoint|endpoints|deploy|deploys|commit|commits|repo|repos|reposit[óo]rio)\b/i,
    // prefixos de verbos de ação; lookaheads evitam casar substantivos soltos
    // que só compartilham o radical (validade, montante/montagem).
    // an[aá]lis(?!e): exclui o substantivo "análise/análises" (rotineiro — setor
    // de Análises, "manda a análise") e mantém só o verbo (analisar/analisa/analisando).
    verbs:
      /\b(implementa|audita|auditoria|refatora|an[aá]lis(?!e)|investiga|diagnostic|diagn[óo]stic|debug|corrig|corre[çc][ãa]o|configura|migra|otimiz|revis|valida(?!de)|planej|estrutura|monta(?!nte|gem|dor|nh))/i,
    deleg:
      /\b(manda o|manda a|despach|delega|cria(r)? demanda|distribui(r)? pro time)\b/i,
  },
  light: {
    ack: /^(ok|okay|blz|beleza|certo|sim|n[ãa]o|valeu|vlw|show|massa|perfeito|fechou|isso|exato|confirma(do|r)?|combinado|pode ser|👍|🙏|👌|✅|kk+|h[ae]h[ae]|obrigad[oa])\b/i,
    greet: /^(oi+|opa|ol[áa]|e[ -]?a[íi]|fala|bom dia|boa tarde|boa noite)\b/i,
  },
} as const;

/** Detecta enumeração/lista ou conjunção de tarefas — "pedido multi-parte". */
const PAINEL_MULTIPART =
  /(^|\n)\s*(\d+[.)]|[-*•])\s|\b(e tamb[ée]m|al[ée]m disso|tamb[ée]m precis|depois (faz|disso)|por fim)\b/i;

/** Keywords estratégicas — candidatas a opus (com densidade; senão sonnet·max). */
const PAINEL_STRATEGIC = /\b(estrat[ée]gi|arquitet|roadmap|vis[ãa]o de (produto|neg[óo]cio)|posicionament|trade.?off)/i;

/**
 * Dev pesado — o que justifica opus: construir/refatorar/migrar código de
 * verdade, não só mencionar um arquivo. Exige verbo de engenharia forte.
 */
const PAINEL_DEV_HEAVY =
  /\b(implementa|refatora[çc]?|migra[çc]|feature (completa|nova)|end.?to.?end|do zero|reescreve|reestrutura|corrige (o|a|esse|essa)? ?(bug|erro|falha) (complex|cabelud|dif[íi]cil)|debug (profundo|complex))/i;

/** Pedido explícito de fable/ultra — único caminho automático pro fable. */
const PAINEL_FABLE = /\b(fable|modo ultra|an[áa]lise ultra|ultracode)\b/i;

/**
 * Classificador do painel — gate primário por SINAL, tamanho como escalador.
 * Quantos sinais PESADOS distintos a mensagem dispara (código conta como 1).
 */
function countHeavySignals(raw: string, t: string): number {
  const H = PAINEL_SIGNALS.heavy;
  let n = 0;
  if (PAINEL_SIGNALS.code.test(raw)) n++;
  if (H.sql.test(t)) n++;
  if (H.path.test(raw)) n++;
  if (H.fn.test(raw)) n++;
  if (H.nouns.test(t)) n++;
  if (H.verbs.test(t)) n++;
  if (H.deleg.test(t)) n++;
  return n;
}

export function classifyPainel(text: string): Classification {
  const raw = (text || '').trim();
  const t = raw.toLowerCase();
  const len = raw.length;
  const L = PAINEL_LENGTH;
  const S = PAINEL_SIGNALS;

  const hasCode = S.code.test(raw);
  const heavyCount = countHeavySignals(raw, t);
  const hasHeavy = heavyCount > 0;
  const multipart = PAINEL_MULTIPART.test(raw);
  const strategic = PAINEL_STRATEGIC.test(t);
  const devHeavy = PAINEL_DEV_HEAVY.test(t) && (hasCode || heavyCount >= 2 || multipart || len > L.dense);
  // Densidade geral — escala o esforço dentro do modelo escolhido.
  const dense = len > L.dense || heavyCount >= 2 || hasCode;

  // fable → só sob pedido explícito. Esforço acompanha a densidade; acima de
  // medium a ponte pede autorização antes de rodar.
  if (PAINEL_FABLE.test(t)) {
    return {
      tier: 'máximo',
      model: 'fable',
      effort: dense || strategic ? 'high' : 'medium',
      reason: 'fable explícito',
    };
  }

  // máximo → opus: SÓ dev pesado ou estratégico denso. Estratégico solto
  // ("qual a estratégia?") fica no sonnet·max — opus exige substância junto.
  if (devHeavy || (strategic && (multipart || dense || len > L.maximo))) {
    const extreme = (strategic && devHeavy) || heavyCount >= 4 || (multipart && hasCode && len > L.maximo);
    return {
      tier: 'máximo',
      model: 'opus',
      // medium é o piso do opus; xhigh/max só no extremo (e a ponte pede autorização).
      effort: extreme ? 'max' : dense || strategic ? 'high' : 'medium',
      reason: devHeavy ? 'dev pesado' : 'estratégico denso',
    };
  }

  // crítico → sonnet · max: denso (2+ sinais, código, pesado+longo) ou estratégico.
  if ((hasHeavy && dense) || strategic || len > L.heavy) {
    return {
      tier: 'crítico',
      model: 'sonnet',
      effort: 'max',
      reason: strategic ? 'estratégico' : hasCode ? 'código' : heavyCount >= 2 ? 'múltiplos sinais' : 'pesado longo',
    };
  }

  // complexo → sonnet · high: um sinal pesado, ou texto longo estruturado.
  if (hasHeavy || len >= L.complex) {
    return {
      tier: 'complexo',
      model: 'sonnet',
      effort: 'high',
      reason: hasHeavy ? 'sinal pesado' : 'longa',
    };
  }

  // trivial → haiku: curtíssimo + só sinal leve (ack/saudação), sem nada pesado.
  if (len <= L.trivialMax && (S.light.ack.test(t) || S.light.greet.test(t))) {
    return { tier: 'trivial', model: 'haiku', effort: null, reason: 'ack/saudação' };
  }

  // médio → sonnet · medium: o dia a dia (pergunta/conversa curta sem sinal pesado).
  return { tier: 'médio', model: 'sonnet', effort: 'medium', reason: 'default' };
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
  painel: { id: 'painel', classify: classifyPainel, stub: false },
};

export const DEFAULT_PROFILE: RouterProfileId = 'whatsapp';
