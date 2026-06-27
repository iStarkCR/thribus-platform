/**
 * Cortex Router — roteamento de modelo por complexidade, módulo único.
 *
 * `route()` é PURA: sem I/O, sem leitura de disco/rede, sem estado global.
 * Recebe a mensagem + o estado relevante (sticky atual, override) e devolve o
 * modelo/esforço a usar. Quem chama é responsável por persistir o `stickyModel`.
 *
 * Promove a heurística que hoje vive dentro do daemon do WhatsApp (cortexBrain()
 * em Bukowiski/daemon/server.js) a um módulo do platform. Fase 1: só o módulo —
 * NÃO integrado na ponte nem no daemon ainda.
 *
 * Refinamentos preservados do daemon:
 *   - sticky model : dentro da conversa o modelo só SOBE (cache quente);
 *   - imagem→sonnet: imagem nunca roda em haiku (piso de visão);
 *   - override     : pin manual (/opus, /sonnet, ...) vence a heurística.
 */

import { brainOf } from './cortexBrain';
import type { CortexModel, CortexEffort } from './cortexBrain';
import {
  PROFILES,
  DEFAULT_PROFILE,
  MODEL_RANK,
  DEFAULT_RANK,
  VISION_FLOOR_MODEL,
} from './cortex-router.config';
import type { RouterProfileId, Tier, Classification } from './cortex-router.config';

export type { RouterProfileId, Tier, Classification };
export { PROFILES, DEFAULT_PROFILE } from './cortex-router.config';

/**
 * Override manual — espelha `prefs.model` + `prefs.effort` do daemon. É o hook
 * pra fixar modelo (/opus, /sonnet, /haiku, /fable): `forcedModel` vence a
 * heurística inteira E desativa o sticky daquela rodada.
 */
export interface RouteContext {
  forcedModel?: CortexModel | null;
  forcedEffort?: CortexEffort | null;
}

export interface RouteInput {
  /** Mensagem do usuário. */
  text: string;
  /** A mensagem traz imagem? Imagem força sonnet quando cairia em haiku. */
  hasImage?: boolean;
  /** Sticky atual da conversa (o último modelo automático). null = sem sticky. */
  currentModel?: CortexModel | null;
  /** Perfil de calibragem. Default: 'whatsapp'. */
  profile?: RouterProfileId;
  /** Override manual + outros hooks. */
  ctx?: RouteContext;
}

export interface RouteResult {
  /** Tier da classificação por complexidade (informativo mesmo sob override). */
  tier: Tier;
  /** Modelo EFETIVO — já com override, sticky e imagem aplicados. */
  model: CortexModel;
  /** Esforço EFETIVO — null quando o modelo não é effortable (só opus/fable). */
  effort: CortexEffort | null;
  /** Motivo curto da decisão. */
  reason: string;
  /** De onde veio o modelo: pin manual ou heurística automática. */
  source: 'override' | 'auto';
  /**
   * Modelo a persistir como `currentModel` da PRÓXIMA rodada (o caller faz o I/O).
   * null = não alterar o sticky (override ativo, igual ao daemon, que não mexe no
   * sticky quando há pin). É o modelo PRÉ-imagem: imagem trivial não fixa sonnet
   * na conversa.
   */
  stickyModel: CortexModel | null;
}

const rankOf = (m: CortexModel): number => MODEL_RANK[m] ?? DEFAULT_RANK;

export function route(input: RouteInput): RouteResult {
  const {
    text,
    hasImage = false,
    currentModel = null,
    profile = DEFAULT_PROFILE,
    ctx = {},
  } = input;

  const prof = PROFILES[profile] ?? PROFILES[DEFAULT_PROFILE];
  const brain: Classification = prof.classify(text);

  let model: CortexModel;
  let effort: CortexEffort | null;
  let source: RouteResult['source'];
  let stickyModel: CortexModel | null;
  let reason: string;

  if (ctx.forcedModel) {
    // Override manual: vence a heurística e NÃO mexe no sticky (igual daemon).
    model = ctx.forcedModel;
    effort = ctx.forcedEffort ?? brain.effort;
    source = 'override';
    stickyModel = null;
    reason = 'override manual';
  } else {
    // Cortex Brain + STICKY: o modelo só sobe na conversa. Manter o atual numa
    // mensagem igual/mais simples preserva o prompt cache quente.
    model = brain.model;
    let kept = false;
    if (currentModel && currentModel !== brain.model && rankOf(brain.model) <= rankOf(currentModel)) {
      model = currentModel;
      kept = true;
    }
    // Esforço segue a mensagem só quando NÃO mantivemos um modelo maior à força.
    effort = ctx.forcedEffort ?? (kept ? null : brain.effort);
    source = 'auto';
    // Sticky persiste o modelo PRÉ-imagem (no daemon, prefs.activeModel é gravado
    // antes do ajuste de visão).
    stickyModel = model;
    reason = brain.reason;
  }

  // Imagem precisa de visão decente — nunca roda em haiku. Aplicado por último,
  // depois do sticky, e NÃO altera o stickyModel (o ajuste é só desta rodada).
  if (hasImage && model === 'haiku') {
    model = VISION_FLOOR_MODEL;
  }

  // --effort só faz efeito em modelos de raciocínio (opus/fable). Para os demais
  // o esforço é descartado — refletimos isso no resultado em vez de carregar um
  // valor que não seria aplicado.
  const effectiveEffort = brainOf(model).effortable ? effort : null;

  return { tier: brain.tier, model, effort: effectiveEffort, reason, source, stickyModel };
}
