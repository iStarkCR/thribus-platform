/**
 * Helper de seleção de API key por provider.
 *
 * O workspace tem chaves separadas por provider (`anthropic_api_key`,
 * `openai_api_key`) + uma legacy (`llm_api_key`) mantida pra retrocompat.
 * Este helper escolhe a chave certa baseado no nome do model.
 *
 * Precedência (do mais específico pro mais genérico):
 *   1. Chave do provider específico no workspace (anthropicApiKey / openaiApiKey)
 *   2. Chave legacy do workspace (llmApiKey) — pra workspaces antigos sem
 *      backfill ou em caso de fallback
 *   3. Env var (ANTHROPIC_API_KEY / OPENAI_API_KEY) — resolvida por callLLM
 *
 * Esta função NÃO consulta env vars; apenas decide entre os campos do
 * workspace. O fallback final (env) acontece dentro de callLLM/getClient.
 */

import type { WorkspaceRecord } from '../db/index.js';

export type LLMProvider = 'anthropic' | 'openai';

/** Retorna o provider derivado do nome do model. */
export function detectProvider(model: string): LLMProvider | null {
  const m = model.toLowerCase();
  if (m.startsWith('claude-')) return 'anthropic';
  if (
    m.startsWith('gpt-') ||
    m.startsWith('o1-') ||
    m.startsWith('o3-') ||
    m.startsWith('whisper-') ||
    m.startsWith('tts-') ||
    m.startsWith('text-embedding-') ||
    m.startsWith('dall-e-')
  ) {
    return 'openai';
  }
  return null;
}

/**
 * Atalho pra escolher chave por provider explícito (sem inferir do model).
 * Útil pra transcrição de áudio (Whisper) e TTS, que sempre rodam OpenAI
 * independente do model do agente.
 */
export function pickApiKeyByProvider(
  provider: LLMProvider,
  workspace?: WorkspaceRecord | null,
): string | undefined {
  if (!workspace) return undefined;
  if (provider === 'anthropic') return workspace.anthropicApiKey || workspace.llmApiKey || undefined;
  return workspace.openaiApiKey || workspace.llmApiKey || undefined;
}

/**
 * Escolhe a API key do workspace pra usar com este model.
 * Retorna `undefined` se workspace ausente OU sem chave configurada — o
 * caller é responsável por fazer fallback pra env var (callLLM faz isso).
 */
export function pickApiKey(model: string, workspace?: WorkspaceRecord | null): string | undefined {
  if (!workspace) return undefined;
  const provider = detectProvider(model);
  if (provider === 'anthropic') {
    return workspace.anthropicApiKey || workspace.llmApiKey || undefined;
  }
  if (provider === 'openai') {
    return workspace.openaiApiKey || workspace.llmApiKey || undefined;
  }
  // Provider desconhecido — devolve legacy pra não quebrar comportamento atual
  return workspace.llmApiKey || undefined;
}
