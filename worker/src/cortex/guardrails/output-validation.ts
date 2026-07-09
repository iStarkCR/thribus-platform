/**
 * Output Validation — Fase 3.
 *
 * Valida/sanitiza a resposta do agente ANTES de sair pro caller:
 *   1. PII leak: mascara PII que o agente tenha ecoado (reusa pii.ts)
 *   2. System prompt leak: detecta a resposta vazando instruções internas
 *   3. Tamanho máximo (truncamento defensivo)
 *
 * Desligável via CORTEX_OUTPUT_VALIDATION=false.
 */

import { detectPii, maskPii } from './pii.js';

const MAX_OUTPUT_CHARS = 12000;

/** Marcadores que só existem em instrução interna — nunca em resposta legítima. */
const LEAK_MARKERS: RegExp[] = [
  /\[CONTEXTO DO CORTEX BRAIN\]/i,
  /\b(meu|my)\s+system\s*prompt\s+(é|is)\b/i,
  /\bminhas\s+instru[çc][õo]es\s+(iniciais|de\s+sistema)\s+s[ãa]o\b/i,
  /\bhere\s+(is|are)\s+my\s+(system\s+prompt|initial\s+instructions)\b/i,
];

export interface OutputValidationResult {
  /** Texto sanitizado (PII mascarado, truncado se preciso). */
  text: string;
  /** true se a resposta parece vazar prompt/instruções internas. */
  promptLeakDetected: boolean;
  piiMasked: number;
  truncated: boolean;
}

export function validateAgentOutput(raw: string): OutputValidationResult {
  let text = raw;
  let truncated = false;

  if (text.length > MAX_OUTPUT_CHARS) {
    text = text.slice(0, MAX_OUTPUT_CHARS) + '…';
    truncated = true;
  }

  const promptLeakDetected = LEAK_MARKERS.some((r) => r.test(text));

  const piiMatches = detectPii(text);
  if (piiMatches.length > 0) {
    text = maskPii(text, piiMatches);
  }

  return {
    text,
    promptLeakDetected,
    piiMasked: piiMatches.length,
    truncated,
  };
}
