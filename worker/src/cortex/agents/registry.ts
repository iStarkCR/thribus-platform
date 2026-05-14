/**
 * Registry de agentes do Cortex Brain.
 *
 * Fase 0: registry em memória, agentes definidos em código.
 * Fase 2+: vai virar tabela `cortex_agents` no Postgres com config per-tenant.
 *
 * Como adicionar um agente novo:
 *   1. Criar `agents/definitions/<name>.ts` exportando uma AgentDefinition
 *   2. Importar e registrar em `loadBuiltInAgents()` abaixo
 */

import type { AgentDefinition, AgentCategory } from './types.js';
import { biancaDefinition } from './definitions/bianca.js';
import { renataDefinition } from './definitions/renata.js';
import { marcosDefinition } from './definitions/marcos.js';
import { carlaDefinition } from './definitions/carla.js';

class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  register(def: AgentDefinition): void {
    if (this.agents.has(def.id)) {
      console.warn(`[cortex.registry] sobrescrevendo agent ${def.id}`);
    }
    this.agents.set(def.id, def);
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  listByCategory(category: AgentCategory): AgentDefinition[] {
    return this.list().filter((a) => a.category === category);
  }

  /** Resumo curto pro Brain analyzer (system prompt). */
  describeAll(): string {
    return this.list()
      .map(
        (a) =>
          `- ${a.id} (${a.name}, ${a.category}): ${a.description}\n  Intents: ${a.intents.join(', ')}`,
      )
      .join('\n');
  }

  /** Loga inventário no startup. */
  logInventory(): void {
    const list = this.list();
    console.log(
      `[cortex.registry] ${list.length} agente(s) registrado(s): ${list.map((a) => a.id).join(', ')}`,
    );
  }
}

export const agentRegistry = new AgentRegistry();

/**
 * Carrega agentes built-in. Chamar uma vez no boot.
 * Idempotente — pode ser chamado várias vezes.
 */
export function loadBuiltInAgents(): void {
  agentRegistry.register(biancaDefinition);
  agentRegistry.register(renataDefinition);
  agentRegistry.register(marcosDefinition);
  agentRegistry.register(carlaDefinition);
}
