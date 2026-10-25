import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Crown, Zap } from 'lucide-react';
import type { Agent, Sector } from '@/types';
import { useAppStore } from '@/hooks/useAppStore';
import { aggregateForAgents, type AgentLive } from '@/lib/agent-live-stats';
import * as orchestration from '@/services/orchestration';
import { SEED_HANDOFFS, type AgentHandoff } from '@/lib/seed-orchestration';

interface OrgChartProps {
  agents: Agent[];
  sectors: Sector[];
  byAgent: Map<string, AgentLive>;
  demandsConfigured: boolean;
  onSelectAgent: (a: Agent) => void;
}

interface NodePos {
  cx: number;
  cy: number;
  top: number;
  bottom: number;
}

interface Fired {
  id: string;
  d: string;
}

const SUP_KEY = '__supervisor__';
const secKey = (id: string | null) => `sec:${id ?? '__none__'}`;

const STATUS_DOT: Record<string, string> = {
  online: 'bg-semantic-green',
  standby: 'bg-semantic-amber',
  offline: 'bg-creme-faint',
};

/** Curva vertical (pai→filho): sai pela base do pai, entra pelo topo do filho. */
function edgePath(from: NodePos, to: NodePos): string {
  const sx = from.cx;
  const sy = from.bottom;
  const ex = to.cx;
  const ey = to.top;
  const dy = Math.max(26, (ey - sy) * 0.5);
  return `M ${sx} ${sy} C ${sx} ${sy + dy}, ${ex} ${ey - dy}, ${ex} ${ey}`;
}

/** Arco abaulado entre dois colaboradores (handoff: um consulta o outro). */
function arcPath(a: NodePos, b: NodePos): string {
  const mx = (a.cx + b.cx) / 2;
  const my = Math.min(a.cy, b.cy) - Math.abs(b.cx - a.cx) * 0.16 - 36;
  return `M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`;
}

export function OrgChart({ agents, sectors, byAgent, demandsConfigured, onSelectAgent }: OrgChartProps) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [pos, setPos] = useState<Map<string, NodePos>>(new Map());
  const posRef = useRef(pos);
  posRef.current = pos;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fired, setFired] = useState<Fired[]>([]);
  const [handoffs, setHandoffs] = useState<AgentHandoff[]>(SEED_HANDOFFS);

  const supervisor = useMemo(() => agents.find((a) => a.isSupervisor) ?? null, [agents]);

  const columns = useMemo(() => {
    const nonSup = agents.filter((a) => !a.isSupervisor);
    const bySector = new Map<string, Agent[]>();
    for (const a of nonSup) {
      const k = a.sectorId ?? '__none__';
      if (!bySector.has(k)) bySector.set(k, []);
      bySector.get(k)!.push(a);
    }
    const cols: { sector: Sector | null; agents: Agent[] }[] = sectors
      .filter((s) => bySector.has(s.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ sector: s, agents: bySector.get(s.id)!.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
    if (bySector.has('__none__')) {
      cols.push({ sector: null, agents: bySector.get('__none__')!.slice().sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return cols;
  }, [agents, sectors]);

  const setRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(id, el);
      else nodeRefs.current.delete(id);
    },
    [],
  );

  const measure = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    const next = new Map<string, NodePos>();
    nodeRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next.set(id, {
        cx: r.left - cr.left + r.width / 2,
        cy: r.top - cr.top + r.height / 2,
        top: r.top - cr.top,
        bottom: r.bottom - cr.top,
      });
    });
    setPos(next);
    setSize({ w: cont.clientWidth, h: cont.clientHeight });
  }, []);

  useLayoutEffect(() => {
    measure();
    // Re-mede após o paint/fontes assentarem.
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [measure, columns, supervisor]);

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(cont);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // Handoffs reais (se houver) — senão mantém o seed como demo.
  useEffect(() => {
    if (!orchestration.orchestrationConfigured || !activeWorkspaceId) return;
    orchestration
      .listHandoffs(activeWorkspaceId)
      .then((rows) => {
        if (rows.length) setHandoffs(rows);
      })
      .catch(() => {});
  }, [activeWorkspaceId]);

  const fire = useCallback((fromId: string, toId: string) => {
    const a = posRef.current.get(fromId);
    const b = posRef.current.get(toId);
    if (!a || !b) return;
    const id = `fire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFired((curr) => [...curr, { id, d: arcPath(a, b) }]);
    window.setTimeout(() => setFired((curr) => curr.filter((f) => f.id !== id)), 2200);
  }, []);

  // Dispara pulsos de handoff: resolve from/to para nós presentes; se o seed não
  // casar com os colaboradores deste workspace, ilustra com pares aleatórios.
  useEffect(() => {
    const present = new Set(agents.filter((a) => !a.isSupervisor).map((a) => a.id));
    const byName = new Map(agents.map((a) => [a.name.toLowerCase(), a.id]));
    const resolve = (id: string, name: string): string | null => {
      if (present.has(id)) return id;
      const n = byName.get((name ?? '').toLowerCase());
      return n && present.has(n) ? n : null;
    };
    const resolved: [string, string][] = [];
    for (const h of handoffs) {
      const f = resolve(h.fromAgentId, h.fromAgentName);
      const t = resolve(h.toAgentId, h.toAgentName);
      if (f && t && f !== t) resolved.push([f, t]);
    }
    const ids = [...present];
    const demo = resolved.length === 0;
    if (demo && ids.length < 2) return;

    let i = 0;
    const tick = () => {
      let pair: [string, string] | undefined;
      if (!demo) {
        pair = resolved[i % resolved.length];
      } else {
        const a = ids[Math.floor(Math.random() * ids.length)];
        let b = ids[Math.floor(Math.random() * ids.length)];
        if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
        pair = [a, b];
      }
      i++;
      if (pair) fire(pair[0], pair[1]);
    };
    const t0 = window.setTimeout(tick, 1400);
    const iv = window.setInterval(tick, 3400);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(iv);
    };
  }, [handoffs, agents, fire]);

  // Arestas pai→filho (dependem das posições medidas).
  const edges = useMemo(() => {
    const list: { id: string; d: string; color?: string }[] = [];
    const supPos = pos.get(SUP_KEY);
    for (const col of columns) {
      const sPos = pos.get(secKey(col.sector?.id ?? null));
      if (supPos && sPos) list.push({ id: `e-${secKey(col.sector?.id ?? null)}`, d: edgePath(supPos, sPos), color: col.sector?.color });
      if (!sPos) continue;
      for (const a of col.agents) {
        const aPos = pos.get(a.id);
        if (aPos) list.push({ id: `e-${a.id}`, d: edgePath(sPos, aPos), color: col.sector?.color });
      }
    }
    return list;
  }, [pos, columns]);

  // Pulsos ambiente: Bukowiski → cada setor, contínuos.
  const ambient = useMemo(() => {
    const supPos = pos.get(SUP_KEY);
    if (!supPos) return [] as { id: string; d: string }[];
    return columns
      .map((col) => {
        const sPos = pos.get(secKey(col.sector?.id ?? null));
        return sPos ? { id: `amb-${secKey(col.sector?.id ?? null)}`, d: edgePath(supPos, sPos) } : null;
      })
      .filter((x): x is { id: string; d: string } => x !== null);
  }, [pos, columns]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 text-[12px] text-creme-mute">
        <Zap size={13} className="text-brand-bright" />
        Operação sempre ativa — os pulsos verdes mostram consultas (handoffs) entre colaboradores.
      </div>

      <div ref={containerRef} className="relative overflow-x-auto pb-4">
        {/* Camada de linhas + pulsos (atrás dos nós) */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.w || '100%'}
          height={size.h || '100%'}
          style={{ zIndex: 0 }}
        >
          {edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              stroke={e.color ?? 'rgb(var(--brand))'}
              strokeOpacity={0.22}
              strokeWidth={1.5}
            />
          ))}

          {/* Pulso ambiente (SMIL — barato, declarativo) */}
          {ambient.map((p, i) => (
            <g key={p.id}>
              <circle r={5} fill="rgb(var(--brand-glow))" opacity={0.28}>
                <animateMotion dur={`${3 + (i % 4) * 0.5}s`} begin={`${(i % 5) * 0.6}s`} repeatCount="indefinite" path={p.d} />
              </circle>
              <circle r={2.4} fill="rgb(var(--brand-bright))">
                <animateMotion dur={`${3 + (i % 4) * 0.5}s`} begin={`${(i % 5) * 0.6}s`} repeatCount="indefinite" path={p.d} />
              </circle>
            </g>
          ))}

          {/* Pulso disparado (handoff) — linha acende + ponto rápido viaja */}
          {fired.map((f) => (
            <g key={f.id}>
              <path d={f.d} fill="none" stroke="rgb(var(--brand-bright))" strokeOpacity={0.75} strokeWidth={2}>
                <animate attributeName="stroke-opacity" values="0;0.8;0" dur="2.2s" repeatCount="1" />
              </path>
              <circle r={6} fill="rgb(var(--brand-glow))" opacity={0.45}>
                <animateMotion dur="1s" repeatCount="2" path={f.d} />
              </circle>
              <circle r={3} fill="rgb(var(--brand-bright))">
                <animateMotion dur="1s" repeatCount="2" path={f.d} />
              </circle>
            </g>
          ))}
        </svg>

        {/* Nós */}
        <div className="relative flex flex-col items-center gap-12 min-w-max px-4" style={{ zIndex: 1 }}>
          {/* Topo — supervisor (Bukowiski) */}
          {supervisor ? (
            <button
              ref={setRef(SUP_KEY)}
              onClick={() => onSelectAgent(supervisor)}
              className="group relative flex items-center gap-3 rounded-2xl px-5 py-3.5 bg-surface-2 border border-gold/35 cursor-pointer transition-all hover:-translate-y-0.5 shadow-[0_18px_44px_-24px_rgba(198,164,90,0.5)]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-[16px] font-bold shrink-0"
                style={{ background: 'rgb(var(--gold-bright) / 0.14)', color: 'rgb(var(--gold-bright))' }}
              >
                {supervisor.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5 text-[15px] font-bold text-creme">
                  {supervisor.name}
                  <Crown size={13} className="text-gold-bright" />
                </div>
                <div className="text-[11.5px] text-creme-mute">Supervisor · orquestra o time</div>
              </div>
            </button>
          ) : (
            <div
              ref={setRef(SUP_KEY)}
              className="flex items-center gap-2 rounded-2xl px-5 py-3.5 bg-surface-2 border border-default"
            >
              <Crown size={15} className="text-gold-bright" />
              <span className="text-[14px] font-bold text-creme">Operação</span>
            </div>
          )}

          {/* Setores + colaboradores */}
          <div className="flex flex-wrap justify-center items-start gap-x-8 gap-y-12">
            {columns.map((col) => {
              const live = aggregateForAgents(byAgent, col.agents.map((a) => a.id));
              const color = col.sector?.color ?? 'rgb(var(--brand))';
              return (
                <div key={secKey(col.sector?.id ?? null)} className="flex flex-col items-center gap-6">
                  {/* Nó de setor */}
                  <div
                    ref={setRef(secKey(col.sector?.id ?? null))}
                    className="relative rounded-2xl px-4 py-3 bg-surface-2 border w-[188px]"
                    style={{
                      borderColor: `color-mix(in srgb, ${color} 42%, transparent)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 16%, transparent), 0 0 22px -14px ${color}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                      />
                      <span className="text-[12.5px] font-bold text-creme truncate">{col.sector?.name ?? 'Sem setor'}</span>
                      <span className="ml-auto text-[10.5px] font-bold text-creme-faint bg-creme/[0.05] px-1.5 py-px rounded-full">
                        {col.agents.length}
                      </span>
                    </div>
                    {demandsConfigured && (
                      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-default/60">
                        {[
                          { label: 'Aberto', value: live.open, tone: 'text-creme' },
                          { label: 'Feito', value: live.doneToday, tone: 'text-semantic-green' },
                          { label: 'Escal.', value: live.escalated, tone: 'text-semantic-red' },
                        ].map((s) => (
                          <div key={s.label} className="text-center">
                            <div className={clsx('font-mono text-[14px] font-bold leading-none tabular-nums', s.value ? s.tone : 'text-creme-faint')}>
                              {s.value || '—'}
                            </div>
                            <div className="text-[9px] text-creme-faint uppercase tracking-[0.06em] font-semibold mt-1">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Colaboradores do setor */}
                  <div className="flex flex-col gap-2.5">
                    {col.agents.map((a) => {
                      const st = STATUS_DOT[a.status] ?? STATUS_DOT.offline;
                      const active = byAgent.get(a.id)?.active ?? false;
                      const off = a.status !== 'online';
                      return (
                        <button
                          key={a.id}
                          ref={setRef(a.id)}
                          onClick={() => onSelectAgent(a)}
                          title={`${a.name} · ${a.sector}`}
                          className={clsx(
                            'group relative flex items-center gap-2.5 rounded-xl pl-2.5 pr-3 py-2 w-[188px] bg-surface-2 border border-default cursor-pointer transition-all hover:border-brand/40 hover:-translate-y-0.5',
                            off && 'opacity-60 hover:opacity-90',
                          )}
                        >
                          <div className="relative shrink-0">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold"
                              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                            >
                              {a.name.charAt(0).toUpperCase()}
                            </div>
                            <span
                              className={clsx(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-2',
                                st,
                                a.status === 'online' && 'animate-pulse-dot',
                              )}
                            />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-[12.5px] font-semibold text-creme truncate">{a.name}</div>
                            <div className="text-[10.5px] text-creme-mute truncate">{a.sector}</div>
                          </div>
                          {active && (
                            <span
                              title="Ativo agora — executando demanda"
                              className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-bright animate-pulse-dot shrink-0"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
