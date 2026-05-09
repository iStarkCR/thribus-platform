/**
 * Tool dispatcher
 *
 * Executa uma tool pelo nome buscando sua definição no banco.
 * Cada tool é um endpoint HTTP — o dispatcher monta a requisição
 * conforme o método e injeta os parâmetros fornecidos pelo Claude.
 *
 * Autenticação: a tool aponta pro tipo (basic/bearer/apikey) e nomes
 * simbólicos das credenciais (ex: { username_ref: "ixc_token" }). Os
 * valores reais ficam em `workspaces.credentials` do cliente. Assim
 * cada cliente novo é só criar workspace + popular credentials no painel,
 * sem mexer em env var ou redeploy.
 *
 * Headers extras: tool pode declarar headers fixos (ex: { ixcsoft: "listar" }).
 */

import { db } from '../db/index.js';
import type { ToolAuthCredentials, ToolAuthType } from '../db/index.js';
import {
  executeInternal,
  isInternalTool,
  type InternalToolContext,
  type InternalToolResult,
} from './internal.js';
import { preflightCheck } from './preflight.js';

const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS ?? 15_000);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: string;       // serializado como string para passar ao Claude
  error?: string;
  durationMs: number;
  /** M2: se preenchido, sinaliza ao loop que a conversa mudou de agente — interrompe turno. */
  conversationTransferred?: { newAgentId: string; newAgentName: string };
}

interface ToolDef {
  endpoint: string;
  method: string;
  authType?: ToolAuthType;
  authCredentials?: ToolAuthCredentials;
  extraHeaders?: Record<string, string>;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeTool(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  agentId: string,
  /** M2: contexto da conversa pra internal tools (transferir_para_agente). */
  internalCtx?: Omit<InternalToolContext, 'currentAgentId'>,
): Promise<ToolResult> {
  const start = Date.now();

  // ─── Internal tools (M2) ───────────────────────────────────────────────────
  // transferir_para_agente, etc — não batem em endpoint HTTP, executam dentro do worker
  if (isInternalTool(toolName)) {
    if (!internalCtx) {
      return {
        toolCallId,
        toolName,
        output: JSON.stringify({
          erro: `Internal tool "${toolName}" requer contexto da conversa, mas o loop não passou.`,
        }),
        error: 'missing_internal_context',
        durationMs: Date.now() - start,
      };
    }
    const result: InternalToolResult = await executeInternal(toolName, input, {
      ...internalCtx,
      currentAgentId: agentId,
    });
    return {
      toolCallId,
      toolName,
      output: result.output,
      error: result.error,
      conversationTransferred: result.conversationTransferred,
      durationMs: Date.now() - start,
    };
  }

  // ─── Preflight ────────────────────────────────────────────────────────────
  // Validação determinística do input antes de chamar o endpoint. Se a tool
  // tem regras conhecidas (ex: consultar_viabilidade precisa de rua+número),
  // bloqueia a chamada e devolve erro estruturado pro LLM. Evita queimar uma
  // chamada que sabemos que vai falhar (ex: Geogrid retornando "Error in workflow").
  const preflight = preflightCheck(toolName, input);
  if (!preflight.ok) {
    console.warn(`[dispatcher] preflight blocked tool="${toolName}" reason="${preflight.reason}"`);
    return {
      toolCallId,
      toolName,
      output: preflight.output ?? JSON.stringify({ error: 'preflight_blocked' }),
      error: preflight.reason,
      durationMs: Date.now() - start,
    };
  }

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
    // Carrega credenciais do workspace só se a tool precisar (auth ou ainda
    // que não tenha auth, pode ter extra_headers que façam sentido de qualquer jeito).
    // Hoje extra_headers usa valores literais; futuramente pode-se expandir pra
    // aceitar refs também. Por ora só auth_credentials resolve refs.
    let workspaceCreds: Record<string, string> | undefined;
    if (toolDef.authType) {
      const ws = await db.workspaces.findByAgentId(agentId);
      workspaceCreds = ws?.credentials;
    }

    const result = await callToolEndpoint(toolDef, input, workspaceCreds);
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
  toolDef: ToolDef,
  input: Record<string, unknown>,
  workspaceCreds: Record<string, string> | undefined,
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Auth — resolve refs do workspace
  const authHeader = buildAuthHeader(toolDef, workspaceCreds);
  if (authHeader) {
    Object.assign(headers, authHeader);
  }

  // Headers extras (fixos na tool) — sobrescrevem auth se conflitarem
  if (toolDef.extraHeaders) {
    for (const [k, v] of Object.entries(toolDef.extraHeaders)) {
      if (typeof v === 'string') headers[k] = v;
    }
  }

  try {
    const res = await fetch(url, {
      method: toolDef.method.toUpperCase(),
      headers,
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

// ─── Auth resolver ────────────────────────────────────────────────────────────

/**
 * Constrói os headers de auth a partir do auth_type + auth_credentials da tool
 * resolvendo os refs no mapa `workspace.credentials`. Se faltar alguma ref ou
 * o workspace não tiver credentials, lança erro descritivo — assim o LLM vê
 * "credencial X não configurada no workspace" em vez de um 401 genérico.
 */
function buildAuthHeader(
  toolDef: ToolDef,
  workspaceCreds: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!toolDef.authType) return null;

  const creds = toolDef.authCredentials ?? {};
  const lookup = (refName: string | undefined, label: string): string => {
    if (!refName) {
      throw new Error(`tool config: ref de "${label}" não definida`);
    }
    const value = workspaceCreds?.[refName];
    if (!value) {
      throw new Error(
        `credencial "${refName}" não encontrada no workspace deste agent (defina em workspace.credentials)`,
      );
    }
    return value;
  };

  switch (toolDef.authType) {
    case 'basic': {
      const username = lookup(creds.username_ref, 'username');
      const password = lookup(creds.password_ref, 'password');
      const b64 = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${b64}` };
    }
    case 'bearer': {
      const token = lookup(creds.token_ref, 'bearer token');
      return { Authorization: `Bearer ${token}` };
    }
    case 'apikey': {
      const headerName = creds.header_name?.trim();
      if (!headerName) throw new Error('tool config: header_name não definido para apikey');
      const value = lookup(creds.value_ref, 'api key value');
      return { [headerName]: value };
    }
    default:
      return null;
  }
}
