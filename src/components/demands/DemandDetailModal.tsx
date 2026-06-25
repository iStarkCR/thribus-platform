import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Send, AlertTriangle, Folder, Trash2, RefreshCw, Check, Pencil, Save,
  DollarSign, Clock, Cpu, Link2, ThumbsUp,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import {
  updateDemand, deleteDemand, retryDemand, listDemandMessages, sendDemandReply, subscribeDemandMessages,
  type Demand, type DemandMessage, type DemandStatus,
} from '@/services/demands';
import { Markdown } from '@/components/shared/Markdown';
import { MessageSteps } from '@/components/shared/ThinkingActivity';
import { PRIORITIES, priorityMeta, formatCost, formatDuration, formatTokens, dueMeta } from './demandUtils';

const STATUS_LABEL: Record<DemandStatus, string> = {
  todo: 'A fazer', doing: 'Executando', waiting: 'Aguardando você', done: 'Feito', error: 'Erro',
};

export function DemandDetailModal({
  demand, userId, agents, allDemands, agentName, onClose, onChanged, onDeleted,
}: {
  demand: Demand;
  userId: string | null;
  agents: { id: string; name: string }[];
  allDemands: Demand[];
  agentName: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
}) {
  const addToast = useAppStore((s) => s.addToast);
  const [messages, setMessages] = useState<DemandMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const threadEnd = useRef<HTMLDivElement | null>(null);
  const name = agentName(demand.agentId);

  // form de edição (carrega do demand)
  const [eTitle, setETitle] = useState(demand.title);
  const [eDesc, setEDesc] = useState(demand.description ?? '');
  const [eProject, setEProject] = useState(demand.project ?? '');
  const [eAgent, setEAgent] = useState(demand.agentId);
  const [ePriority, setEPriority] = useState(demand.priority);
  const [eDue, setEDue] = useState(demand.dueDate ? demand.dueDate.slice(0, 10) : '');
  const [eTags, setETags] = useState(demand.tags.join(', '));
  const [eDeps, setEDeps] = useState<string[]>(demand.dependsOn);

  const refetch = useCallback(() => { listDemandMessages(demand.id).then(setMessages).catch(() => {}); }, [demand.id]);
  useEffect(() => { refetch(); return subscribeDemandMessages(demand.id, refetch); }, [demand.id, refetch]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, demand.status]);

  // Re-sincroniza o form quando o registro muda no servidor (realtime) — mas não
  // durante uma edição em andamento, pra não apagar o que o Charles está digitando.
  useEffect(() => {
    if (editing) return;
    setETitle(demand.title);
    setEDesc(demand.description ?? '');
    setEProject(demand.project ?? '');
    setEAgent(demand.agentId);
    setEPriority(demand.priority);
    setEDue(demand.dueDate ? demand.dueDate.slice(0, 10) : '');
    setETags(demand.tags.join(', '));
    setEDeps(demand.dependsOn);
  }, [demand, editing]);

  const working = demand.status === 'doing';
  const hasPending = messages.some((m) => m.role === 'user' && m.status === 'pending');
  const prio = priorityMeta(demand.priority);
  const due = dueMeta(demand.dueDate);
  const depDemands = useMemo(() => allDemands.filter((d) => d.id !== demand.id), [allDemands, demand.id]);
  const parent = useMemo(() => (demand.parentId ? allDemands.find((d) => d.id === demand.parentId) ?? null : null), [allDemands, demand.parentId]);
  const children = useMemo(() => allDemands.filter((d) => d.parentId === demand.id), [allDemands, demand.id]);

  async function send(text?: string) {
    const body = (text ?? reply).trim();
    if (!userId || !body || sending) return;
    setSending(true);
    try {
      await sendDemandReply(demand.id, userId, body);
      if (!text) setReply('');
      refetch(); onChanged();
    } catch (e) { addToast((e as Error).message || 'Falha ao enviar', 'red'); }
    finally { setSending(false); }
  }

  async function act(fn: () => Promise<void>, okMsg?: string) {
    setBusy(true);
    try { await fn(); onChanged(); if (okMsg) addToast(okMsg, 'green'); }
    catch (e) { addToast((e as Error).message, 'red'); }
    finally { setBusy(false); }
  }

  async function saveEdits() {
    await act(async () => {
      await updateDemand(demand.id, {
        title: eTitle.trim() || demand.title,
        description: eDesc.trim() || null,
        project: eProject.trim() || null,
        agentId: eAgent,
        priority: ePriority,
        dueDate: eDue ? new Date(`${eDue}T23:59:59`).toISOString() : null,
        tags: eTags.split(',').map((t) => t.trim()).filter(Boolean),
        dependsOn: eDeps,
      });
      setEditing(false);
    }, 'Demanda atualizada');
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-3 md:p-6" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-[1200px] h-[82vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-5 py-3.5 border-b border-default shrink-0 gap-3">
          <div className="min-w-0">
            {editing ? (
              <input className="input text-[15px] font-bold" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
            ) : (
              <div className="text-[15px] font-bold text-creme">{demand.title}</div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10.5px]">
              <Chip>{name}</Chip>
              {demand.project && <Chip><Folder size={9} /> {demand.project}</Chip>}
              <span className={`px-1.5 py-0.5 rounded-full ${working ? 'bg-semantic-blue/15 text-semantic-blue' : demand.status === 'waiting' ? 'bg-semantic-amber/15 text-semantic-amber' : demand.status === 'error' ? 'bg-semantic-red/15 text-semantic-red' : 'bg-surface-3 text-creme-dim'}`}>{working ? 'executando…' : STATUS_LABEL[demand.status]}</span>
              {demand.priority !== 0 && <span className="px-1.5 py-0.5 rounded-full" style={{ background: `${prio.color}22`, color: prio.color }}>{prio.label}</span>}
              {due && <span className={`px-1.5 py-0.5 rounded-full ${due.overdue ? 'bg-semantic-red/15 text-semantic-red' : 'bg-surface-3 text-creme-dim'}`}>{due.label}</span>}
              {parent && <Chip><Link2 size={9} /> sub de: {parent.title.slice(0, 24)}</Chip>}
              {demand.tags.map((t) => <Chip key={t}>#{t}</Chip>)}
            </div>
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme shrink-0"><X size={17} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Thread */}
          <div className="flex-1 min-w-0 flex flex-col border-b md:border-b-0 md:border-r border-default">
            <div className="px-5 py-4 space-y-3 overflow-y-auto text-[13px] flex-1">
              {editing ? (
                <Field label="Descrição / contexto">
                  <textarea className="input min-h-[120px] resize-y" value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
                </Field>
              ) : (
                demand.description && <Bubble who="Charles" side="user"><span className="whitespace-pre-wrap">{demand.description}</span></Bubble>
              )}
              {!editing && demand.result && <Bubble who={name} side="agent"><Markdown text={demand.result} /></Bubble>}
              <MessageSteps refId={demand.id} className="-mt-1 ml-9" />
              {!editing && messages.map((m) =>
                m.status === 'error' ? (
                  <Bubble key={m.id} who={name} side="agent"><span className="text-semantic-red flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {m.error || 'Falhou ao responder'}</span></Bubble>
                ) : m.role === 'user' ? (
                  <Bubble key={m.id} who="Charles" side="user"><span className="whitespace-pre-wrap">{m.content}</span></Bubble>
                ) : (
                  <Bubble key={m.id} who={name} side="agent"><Markdown text={m.content} /></Bubble>
                ),
              )}
              {(working || hasPending) && (
                <div className="flex items-center gap-2 text-[12px] text-semantic-blue pl-1"><Loader2 size={13} className="animate-spin" /> {name} está trabalhando nisso…</div>
              )}
              <div ref={threadEnd} />
            </div>
            {userId && !editing && (
              <div className="px-5 py-3 border-t border-default shrink-0">
                {/* Aprovação rápida quando o agente espera você */}
                {demand.status === 'waiting' && (
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => send('Aprovado — pode seguir.')} disabled={sending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-semantic-green/15 text-semantic-green hover:bg-semantic-green/25 disabled:opacity-40 transition-colors"><ThumbsUp size={12} /> Aprovar</button>
                    <button onClick={() => send('Não seguir com isso por enquanto — te explico abaixo.')} disabled={sending} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-surface-3 text-creme-mute hover:text-creme transition-colors">Recusar</button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea className="input min-h-[40px] max-h-[120px] resize-y w-full" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Responder ao ${name}…`} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }} />
                  <button onClick={() => send()} disabled={sending || !reply.trim()} className="flex items-center px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors shrink-0">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-creme-faint mt-1.5">Continua nesta demanda — ele segue de onde parou. ⌘/Ctrl+Enter.</p>
              </div>
            )}
          </div>

          {/* Painel de ações */}
          <div className="w-full md:w-80 shrink-0 overflow-y-auto p-4 space-y-4 bg-surface-1/40">
            {/* Execução */}
            <Section title="Execução">
              <div className="grid grid-cols-3 gap-2">
                <Metric icon={<DollarSign size={12} />} label="custo" value={formatCost(demand.costUsd)} />
                <Metric icon={<Clock size={12} />} label="tempo" value={formatDuration(demand.durationMs)} />
                <Metric icon={<Cpu size={12} />} label="tokens" value={formatTokens(demand.totalTokens)} />
              </div>
              {demand.retryCount > 0 && <div className="text-[10.5px] text-creme-faint mt-1.5">{demand.retryCount} tentativa(s) de retry</div>}
            </Section>

            {/* Ações rápidas */}
            <Section title="Ações">
              <div className="space-y-1.5">
                {(demand.status === 'error' || demand.status === 'done') && (
                  <ActBtn icon={<RefreshCw size={13} />} onClick={() => act(() => retryDemand(demand.id), 'Reenfileirada')} disabled={busy}>Rodar de novo</ActBtn>
                )}
                {!editing
                  ? <ActBtn icon={<Pencil size={13} />} onClick={() => setEditing(true)} disabled={busy}>Editar</ActBtn>
                  : <ActBtn icon={<Save size={13} />} onClick={saveEdits} disabled={busy} primary>Salvar alterações</ActBtn>}
                {!working && (
                  <div>
                    <label className="text-[10px] text-creme-faint">Mover para</label>
                    <select className="input mt-0.5 text-[12px]" value={demand.status} onChange={(e) => act(() => updateDemand(demand.id, { status: e.target.value as DemandStatus }))} disabled={busy}>
                      {(['todo', 'waiting', 'done', 'error'] as DemandStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Section>

            {/* Edição de campos */}
            {editing && (
              <Section title="Detalhes">
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-creme-faint">Responsável</label>
                    <select className="input mt-0.5 text-[12px]" value={eAgent} onChange={(e) => setEAgent(e.target.value)}>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-creme-faint">Prioridade</label>
                    <div className="flex gap-1 mt-0.5">
                      {PRIORITIES.map((p) => (
                        <button key={p.key} onClick={() => setEPriority(p.value)} className={`flex-1 px-1.5 py-1 rounded text-[11px] font-semibold border ${ePriority === p.value ? 'border-brand bg-brand/10 text-brand-bright' : 'border-default text-creme-mute'}`}>{p.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-creme-faint">Prazo</label><input type="date" className="input mt-0.5 text-[12px]" value={eDue} onChange={(e) => setEDue(e.target.value)} /></div>
                    <div><label className="text-[10px] text-creme-faint">Projeto</label><input className="input mt-0.5 text-[12px]" value={eProject} onChange={(e) => setEProject(e.target.value)} /></div>
                  </div>
                  <div><label className="text-[10px] text-creme-faint">Tags (vírgula)</label><input className="input mt-0.5 text-[12px]" value={eTags} onChange={(e) => setETags(e.target.value)} /></div>
                </div>
              </Section>
            )}

            {/* Dependências */}
            {editing && depDemands.length > 0 && (
              <Section title={<span className="flex items-center gap-1"><Link2 size={11} /> Depende de</span>}>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {depDemands.slice(0, 30).map((d) => {
                    const on = eDeps.includes(d.id);
                    return (
                      <button key={d.id} onClick={() => setEDeps((prev) => on ? prev.filter((x) => x !== d.id) : [...prev, d.id])} className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${on ? 'bg-brand/10 text-brand-bright' : 'text-creme-mute hover:bg-surface-hover'}`}>
                        {on ? <Check size={11} className="shrink-0" /> : <span className="w-[11px] shrink-0" />}
                        <span className="truncate">{d.title}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-creme-faint mt-1">Só entra na fila quando essas estiverem feitas.</p>
              </Section>
            )}
            {!editing && demand.dependsOn.length > 0 && (
              <Section title={<span className="flex items-center gap-1"><Link2 size={11} /> Depende de</span>}>
                {demand.dependsOn.map((id) => {
                  const dd = allDemands.find((x) => x.id === id);
                  return <div key={id} className="text-[11px] text-creme-mute flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dd?.status === 'done' ? 'bg-semantic-green' : dd?.status === 'error' ? 'bg-semantic-red' : 'bg-creme-faint'}`} /> {dd?.title ?? '—'}</div>;
                })}
              </Section>
            )}
            {children.length > 0 && (
              <Section title={<span className="flex items-center gap-1"><Link2 size={11} /> Sub-demandas ({children.length})</span>}>
                {children.map((c) => (
                  <div key={c.id} className="text-[11px] text-creme-mute flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'done' ? 'bg-semantic-green' : c.status === 'error' ? 'bg-semantic-red' : c.status === 'doing' ? 'bg-semantic-blue' : 'bg-creme-faint'}`} /> {c.title}
                  </div>
                ))}
              </Section>
            )}

            <button onClick={async () => { const ok = await useAppStore.getState().askConfirm({ title: 'Apagar demanda', message: demand.title, confirmLabel: 'Apagar' }); if (ok) { await deleteDemand(demand.id).catch(() => {}); onDeleted(demand.id); } }} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-creme-faint hover:text-semantic-red hover:bg-semantic-red/10 transition-colors">
              <Trash2 size={13} /> Apagar demanda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-creme-faint mb-1.5">{title}</div>
      {children}
    </div>
  );
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5 text-center">
      <div className="text-creme-faint flex justify-center mb-0.5">{icon}</div>
      <div className="text-[12px] font-bold text-creme tabular-nums leading-none">{value}</div>
      <div className="text-[9px] text-creme-faint mt-0.5">{label}</div>
    </div>
  );
}
function ActBtn({ icon, children, onClick, disabled, primary }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-40 ${primary ? 'bg-brand text-white hover:bg-brand-bright' : 'bg-surface-3 text-creme-dim hover:bg-surface-hover'}`}>
      {icon} {children}
    </button>
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-creme-dim flex items-center gap-1">{children}</span>;
}
function Bubble({ who, side, children }: { who: string; side: 'user' | 'agent'; children: React.ReactNode }) {
  return (
    <div className={side === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${side === 'user' ? 'text-creme-mute' : 'text-brand-bright'}`}>{who}</div>
      <div className={`max-w-[88%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${side === 'user' ? 'bg-brand/10 text-creme-dim' : 'bg-surface-2 text-creme-dim'}`}>{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">{label}</label>
      {children}
    </div>
  );
}
