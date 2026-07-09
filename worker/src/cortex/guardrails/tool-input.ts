/**
 * Tool Input Validation — Fase 3.
 *
 * Valida o input de cada tool_use retornado pelo LLM contra o input_schema
 * declarado na ToolDefinition, ANTES de executar. Fecha o gap de tool-calls
 * parseados sem garantia de formato.
 *
 * Implementação própria (subset de JSON Schema: required + type primitivo)
 * em vez de zod: os schemas já existem declarados em tool-schemas.ts /
 * definições de agente — duplicá-los em zod criaria duas fontes de verdade.
 */

import type { ToolDefinition } from '../../llm/types.js';

export interface ToolInputValidation {
  ok: boolean;
  errors: string[];
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number' && (type === 'number' || Number.isInteger(value));
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // tipo desconhecido no schema → não bloqueia
  }
}

export function validateToolInput(
  tool: ToolDefinition | undefined,
  input: unknown,
): ToolInputValidation {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['input deve ser um objeto'] };
  }
  const obj = input as Record<string, unknown>;

  // Tool sem definição conhecida → só garante que é objeto (compat legacy)
  if (!tool) return { ok: true, errors: [] };

  const { properties, required } = tool.input_schema;

  for (const key of required ?? []) {
    const v = obj[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      errors.push(`campo obrigatório ausente ou vazio: "${key}"`);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    const spec = properties[key];
    if (!spec) continue; // propriedade extra → tolera (LLMs às vezes anotam)
    if (value !== undefined && value !== null && !matchesType(value, spec.type)) {
      errors.push(`campo "${key}" deveria ser ${spec.type}, veio ${Array.isArray(value) ? 'array' : typeof value}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
