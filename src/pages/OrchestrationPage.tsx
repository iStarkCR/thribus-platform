import { useState } from 'react';
import {
  Network, Route, GitBranch, Sparkles, Power, Clock,
  ArrowRight, CheckCircle2, AlertTriangle, XCircle, Brain, Wrench,
  MessageSquare, ChevronRight, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_ROUTER_RULES, SEED_WORKFLOWS, SEED_HANDOFFS, SEED_TRACES,
  type RouterRule, type Workflow, type DecisionTrace,
} from '@/lib/seed-orchestration';

type Tab = 'router' | 'workflows' | 'traces' | 'handoffs';

export function OrchestrationPage() {
  const [tab, setTab] = useState<Tab>('router');
  const [rules, setRules] = useState<RouterRule[]>(SEED_ROUTER_RULES);
  const [workflows, setWorkflows] = useState<Workflow[]>(SEED_WORKFLOWS);
  const handoffs = SEED_HANDOFFS;
  const traces = SEED_TRACES;

  const toggleRule = (id: string) =>
    setRules((curr) => curr.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

  const toggleWorkflow = (id: string) =>
    setWorkflows((curr) => curr.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Network size={16} className="text-creme-mute" /> Orquestração
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · router · workflows · traces · handoffs
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'router'} onClick={() => setTab('router')} icon={<Route size={13} />} label="Router" count={rules.length} />
        <TabBtn active={tab === 'workflows'} onClick={() => setTab('workflows')} icon={<GitBranch size={13} />} label="Workflows" count={workflows.length} />
        <TabBtn active={tab === 'traces'} onClick={() => setTab('traces')} icon={<Sparkles size={13} />} label="Decision traces" count={traces.length} />
        <TabBtn active={tab === 'handoffs'} onClick={() => setTab('handoffs')} icon={<ArrowRight size={13} />} label="Handoffs" count={handoffs.length} />
      </div>

      {tab === 'router' && <RouterPanel rules={rules} onToggle={toggleRule} />}
      {tab === 'workflows' && <WorkflowsPanel workflows={workflows} onToggle={toggleWorkflow} />}
      {tab === 'traces' && <TracesPanel traces={traces} />}
      {tab === 'handoffs' && <HandoffsPanel handoffs={handoffs} />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px',
        active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent',
      )}
    >
      {icon} {label}
      <span className={clsx(
        'text-[11px] font-mono px-1.5 py-px rounded-full',
        active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint',
      )}>
        {count}
      </span>
    </button>
  );
}

function RouterPanel({ rules, onToggle }: { rules: RouterRule[]; onToggle: (id: string) => void }) {
  const totalHits = rules.reduce((s, r) => s + r.hits30d, 0);
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
            <Brain size={16} className="text-brand-bright" />
          </div>
          <div className="flex-1">
            <h3 className="text-[13.5px] font-bold text-creme">Roteador de intenção</h3>
            <p className="text-[12.5px] text-creme-mute mt-0.5 leading-relaxed">
              Primeira msg do cliente passa por um classificador (gpt-4o-mini) que decide qual agente recebe a conversa.
              Regras abaixo são ordenadas por <b>prioridade</b>; a primeira que casar pega.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[20px] font-bold font-mono text-creme">{totalHits.toLocaleString('pt-BR')}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-creme-faint">hits /30d</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {[...rules].sort((a, b) => b.priority - a.priority).map((r) => (
          <div
            key={r.id}
            className={clsx(
              'bg-surface-2 border rounded-[10px] p-3.5 flex items-center gap-3',
              r.enabled ? 'border-default' : 'border-default opacity-50',
            )}
          >
            <div className="w-7 h-7 rounded-md bg-surface-3 flex items-center justify-center font-mono text-[11px] font-bold text-creme-mute shrink-0">
              #{r.priority}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-bold text-creme">{r.name}</span>
                <code className="text-[10.5px] px-1.5 py-px rounded bg-brand/10 text-brand-bright font-mono">{r.intent}</code>
              </div>
              <div className="text-[11.5px] text-creme-faint mt-0.5 font-mono truncate">{r.matcher}</div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowRight size={12} className="text-creme-faint" />
              <span className="text-[12px] font-semibold text-creme">{r.targetAgentName}</span>
            </div>

            <div className="text-right shrink-0 px-3 border-l border-default">
              <div className="text-[13px] font-bold font-mono text-creme">{r.hits30d.toLocaleString('pt-BR')}</div>
              <div className={clsx(
                'text-[10.5px] font-mono',
                r.precision >= 0.9 ? 'text-semantic-green' :
                r.precision >= 0.8 ? 'text-semantic-amber' : 'text-semantic-red',
              )}>
                {(r.precision * 100).toFixed(0)}% precisão
              </div>
            </div>

            <button
              onClick={() => onToggle(r.id)}
              className={clsx(
                'w-9 h-5 rounded-full transition-colors relative shrink-0',
                r.enabled ? 'bg-brand' : 'bg-surface-3',
              )}
            >
              <span className={clsx(
                'absolute top-0.5 w-4 h-4 rounded-full bg-creme transition-all',
                r.enabled ? 'left-4' : 'left-0.5',
              )} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

const TRIGGER_LABEL: Record<Workflow['trigger'], string> = {
  sla_breach: 'SLA estourou',
  message_received: 'Msg recebida',
  tool_failed: 'Tool falhou',
  sentiment_negative: 'Sentimento negativo',
  silent_lead: 'Lead silencioso',
  tag_added: 'Tag adicionada',
};

function WorkflowsPanel({ workflows, onToggle }: { workflows: Workflow[]; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-2.5">
      {workflows.map((w) => (
        <div
          key={w.id}
          className={clsx(
            'bg-surface-2 border rounded-[10px] p-4 transition-all',
            w.enabled ? 'border-default hover:border-hover' : 'border-default opacity-60',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[14px] font-bold text-creme">{w.name}</h4>
                <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright inline-flex items-center gap-1">
                  <Zap size={9} /> {TRIGGER_LABEL[w.trigger]}
                </span>
              </div>
              <p className="text-[12.5px] text-creme-mute mt-1 leading-relaxed">{w.description}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[14px] font-bold font-mono text-creme">{w.runs30d}</div>
                <div className="text-[10.5px] uppercase tracking-wider text-creme-faint">runs /30d</div>
                {w.runs30d > 0 && (
                  <div className={clsx(
                    'text-[10.5px] font-mono',
                    w.successRate >= 0.9 ? 'text-semantic-green' :
                    w.successRate >= 0.7 ? 'text-semantic-amber' : 'text-semantic-red',
                  )}>
                    {(w.successRate * 100).toFixed(0)}% ok
                  </div>
                )}
              </div>
              <button onClick={() => onToggle(w.id)} className={clsx(
                'p-2 rounded-md',
                w.enabled ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint',
              )}>
                <Power size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3 flex-wrap text-[11px]">
            <span className="text-creme-faint font-mono uppercase tracking-wider text-[10.5px]">passos:</span>
            {w.steps.map((s, idx) => (
              <span key={s.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-1 border border-default font-mono text-creme-dim">
                {idx + 1}. {s.action}
              </span>
            ))}
          </div>

          {w.lastRunAt && (
            <div className="text-[10.5px] text-creme-faint mt-2 font-mono">
              <Clock size={10} className="inline mr-1" />
              último run: {new Date(w.lastRunAt).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TracesPanel({ traces }: { traces: DecisionTrace[] }) {
  const [openId, setOpenId] = useState<string | null>(traces[0]?.id ?? null);
  return (
    <div className="space-y-2.5">
      {traces.map((t) => (
        <TraceCard key={t.id} trace={t} expanded={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
      ))}
    </div>
  );
}

const STEP_ICON = {
  thought: Brain,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  response: MessageSquare,
  handoff: ArrowRight,
};

function TraceCard({ trace: t, expanded, onToggle }: { trace: DecisionTrace; expanded: boolean; onToggle: () => void }) {
  const statusMeta = {
    resolved: { label: 'resolvido', color: 'text-semantic-green bg-semantic-green/10', Icon: CheckCircle2 },
    escalated: { label: 'escalado', color: 'text-semantic-amber bg-semantic-amber/10', Icon: ArrowRight },
    failed: { label: 'falhou', color: 'text-semantic-red bg-semantic-red/10', Icon: XCircle },
  }[t.status];
  const StatusIcon = statusMeta.Icon;

  return (
    <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
      <button onClick={onToggle} className="w-full p-4 text-left hover:bg-surface-hover/30 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-creme">{t.agentName}</span>
              <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10.5px] font-mono', statusMeta.color)}>
                <StatusIcon size={9} /> {statusMeta.label}
              </span>
              <span className="text-[10.5px] text-creme-faint font-mono">{t.steps.length} steps · {t.totalLatencyMs}ms · {t.totalTokens} tok</span>
            </div>
            <p className="text-[12.5px] text-creme-mute mt-1.5 italic leading-relaxed">"{t.userQuery}"</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10.5px] text-creme-faint font-mono">{new Date(t.timestamp).toLocaleString('pt-BR')}</span>
            <ChevronRight size={14} className={clsx('text-creme-faint transition-transform', expanded && 'rotate-90')} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-default p-4 bg-surface-1/40">
          <div className="space-y-2">
            {t.steps.map((s) => {
              const Icon = STEP_ICON[s.type];
              return (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={clsx(
                      'w-7 h-7 rounded-full flex items-center justify-center',
                      s.type === 'tool_call' ? 'bg-brand/15 text-brand-bright' :
                      s.type === 'tool_result' ? 'bg-semantic-green/15 text-semantic-green' :
                      s.type === 'thought' ? 'bg-creme-faint/15 text-creme-mute' :
                      s.type === 'response' ? 'bg-brand/15 text-brand-bright' :
                      'bg-semantic-amber/15 text-semantic-amber',
                    )}>
                      <Icon size={12} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-creme">{s.step}. {s.label}</span>
                      <span className="text-[10.5px] font-mono text-creme-faint">{s.durationMs}ms</span>
                      {s.tokensUsed && <span className="text-[10.5px] font-mono text-brand-bright">{s.tokensUsed} tok</span>}
                    </div>
                    {s.detail && (
                      <pre className="text-[11px] font-mono text-creme-dim mt-1 leading-relaxed whitespace-pre-wrap break-all">{s.detail}</pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-default">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-creme-faint mb-1">Resposta final</div>
            <p className="text-[12.5px] text-creme leading-relaxed">{t.finalAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function HandoffsPanel({ handoffs }: { handoffs: typeof SEED_HANDOFFS }) {
  return (
    <div className="space-y-2">
      {handoffs.map((h) => (
        <div key={h.id} className="bg-surface-2 border border-default rounded-[10px] p-3.5 hover:border-hover transition-all">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="px-2.5 py-1 rounded-md bg-surface-3 text-[12px] font-semibold text-creme-dim">
                {h.fromAgentName}
              </div>
              <ArrowRight size={14} className="text-brand-bright" />
              <div className="px-2.5 py-1 rounded-md bg-brand/15 text-[12px] font-semibold text-brand-bright">
                {h.toAgentName}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-creme-mute leading-relaxed">{h.reason}</div>
              <div className="text-[10.5px] text-creme-faint mt-0.5 font-mono">
                Cliente: {h.customerName} · {new Date(h.timestamp).toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="shrink-0">
              {h.contextPreserved ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-semantic-green/10 text-semantic-green text-[10.5px] font-mono">
                  <CheckCircle2 size={10} /> contexto
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-semantic-amber/10 text-semantic-amber text-[10.5px] font-mono">
                  <AlertTriangle size={10} /> sem contexto
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
