/**
 * Seed Data — vazio por padrão.
 *
 * Cliques no painel (criar agente, criar ferramenta) escrevem
 * nestes arrays em memória. Quando o Supabase estiver plugado,
 * estes arrays viram fallbacks vazios e os dados vêm da API.
 */

import type { Agent, Escalation, Execution, Tool } from '@/types';

export const SEED_AGENTS: Agent[] = [];

export const SEED_TOOLS: Tool[] = [];

export const SEED_EXECUTIONS: Execution[] = [];

export const SEED_ESCALATIONS: Escalation[] = [];
