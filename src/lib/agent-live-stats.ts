/**
 * Agrega demandas reais (team_demands) por colaborador pra alimentar os cards
 * e o organograma. Datas sempre em fuso BR (America/Sao_Paulo).
 */
import type { Demand } from '@/services/demands';

export interface AgentLive {
  /** doing + waiting — demandas em aberto. */
  open: number;
  /** done finalizadas hoje (fuso BR). */
  doneToday: number;
  /** status error — algo a escalar/retomar. */
  escalated: number;
  /** tem alguma demanda em `doing` agora. */
  active: boolean;
  /** total de demandas do colaborador. */
  total: number;
}

export interface SectorLive {
  open: number;
  doneToday: number;
  escalated: number;
  active: boolean;
}

const BR_TZ = 'America/Sao_Paulo';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: BR_TZ }); // YYYY-MM-DD

function brDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fmt.format(d);
}

export function aggregateByAgent(demands: Demand[]): Map<string, AgentLive> {
  const today = fmt.format(new Date());
  const map = new Map<string, AgentLive>();
  const entry = (id: string): AgentLive => {
    let e = map.get(id);
    if (!e) {
      e = { open: 0, doneToday: 0, escalated: 0, active: false, total: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const d of demands) {
    const e = entry(d.agentId);
    e.total++;
    switch (d.status) {
      case 'doing':
        e.open++;
        e.active = true;
        break;
      case 'waiting':
        e.open++;
        break;
      case 'error':
        e.escalated++;
        break;
      case 'done':
        if (brDate(d.finishedAt ?? d.updatedAt) === today) e.doneToday++;
        break;
    }
  }
  return map;
}

export function aggregateForAgents(byAgent: Map<string, AgentLive>, agentIds: Iterable<string>): SectorLive {
  const acc: SectorLive = { open: 0, doneToday: 0, escalated: 0, active: false };
  for (const id of agentIds) {
    const e = byAgent.get(id);
    if (!e) continue;
    acc.open += e.open;
    acc.doneToday += e.doneToday;
    acc.escalated += e.escalated;
    if (e.active) acc.active = true;
  }
  return acc;
}
