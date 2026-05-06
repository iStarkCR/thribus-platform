/**
 * Tool dispatcher
 *
 * Executa uma tool pelo nome buscando sua definição no banco.
 * Cada tool é um endpoint HTTP — o dispatcher monta a requisição
 * conforme o método e injeta os parâmetros fornecidos pelo Claude.
 *
 * Adicione aqui:
 *  - autenticação por tool (Bearer, API Key no header, Basic)
 *  - sanitização de inputs antes de enviar
 *  - timeout por tool (configurável na tabela tools)
 */

import { db } from '../db/index.js';

const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS ?? 15_000);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: string;       // serializado como string para passar ao Claude
  error?: string;
  durationMs: number;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeTool(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  agentId: string,
): Promise<ToolResult> {
  const start = Date.now();

  // Busca definição da tool no banco
  const toolDef = await db.tools.findByName(toolName, agentId);
  if (!toolDef) {
    return {
      toolCallId,
      toolName,
      output: JSON.stringify({ error: `Tool "${toolName}" não encontrada ou não autorizada para este agente.` }),
      error: 'not_found',
      durationMs: Date.now() - start,
    };
  }

  if (!toolDef.active) {
    return {
      toolCallId,
      toolName,
      output: JSON.stringify({ error: `Tool "${toolName}" está desativada.` }),
      error: 'inactive',
      durationMs: Date.now() - start,
    };
  }

  try {
    const result = await callToolEndpoint(toolDef, input);
    return {
      toolCallId,
      toolName,
      output: typeof result === 'string' ? result : JSON.stringify(result),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dispatcher] tool="${toolName}" error: ${message}`);
    return {
      toolCallId,
      toolName,
      output: JSON.stringify({ error: `Falha ao executar "${toolName}": ${message}` }),
      error: message,
      durationMs: Date.now() - start,
    };
  }
}

// ─── HTTP call ────────────────────────────────────────────────────────────────

async function callToolEndpoint(
  toolDef: { endpoint: string; method: string },
  input: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  const isGetOrDelete = ['GET', 'DELETE'].includes(toolDef.method.toUpperCase());

  let url = toolDef.endpoint;

  // Para GET/DELETE, serializa params na query string
  if (isGetOrDelete && Object.keys(input).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])),
    ).toString();
    url = `${url}${url.includes('?') ? '&' : '?'}${qs}`;
  }

  try {
    const res = await fetch(url, {
      method: toolDef.method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        // TODO: adicionar auth por tool (ex: Authorization: Bearer ${toolDef.authToken})
      },
      body: isGetOrDelete ? undefined : JSON.stringify(input),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? res.json() : res.text();
  } finally {
    clearTimeout(timeout);
  }
}
