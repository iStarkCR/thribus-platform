import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, MessageSquare, FolderKanban, Wallet, Send, CheckCircle2, XCircle,
  ShieldAlert, Clock, Loader2, Power, AlertTriangle, Bot, Network,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  internalConfigured,
  listChat, sendChat,
  listProjects, listTasks, createProject, approveProject, rejectProject,
  listPendingAuthorizations, decideAuthorization,
  listRecentCost, getSettings, setPaused,
  listAgents, subscribeTable,
  type ChatMessage, type InternalProject, type InternalTask,
  type Authorization, type CostEvent, type InternalSettings, type InternalAgent,
} from '@/services/internalTeam';

type Tab = 'chat' | 'time' | 'projetos' | 'custo';

export function InternalTeamPage() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Users size={16} className="text-creme-mute" /> Time Interno
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · Bukowiski COO · chat · projetos · custo
          </span>
        </div>
      </div>

      {!internalConfigured && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-300">
          <AlertTriangle size={14} /> Supabase não configurado — defina <code className="font-mono">VITE_SUPABASE_URL</code> e <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> no <code className="font-mono">.env</code>.
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageSquare size={13} />} label="Chat" />
        <TabBtn active={tab === 'time'} onClick={() => setTab('time')} icon={<Network size={13} />} label="Time" />
        <TabBtn active={tab === 'projetos'} onClick={() => setTab('projetos')} icon={<FolderKanban size={13} />} label="Projetos" />
        <TabBtn active={tab === 'custo'} onClick={() => setTab('custo')} icon={<Wallet size={13} />} label="Custo & Limites" />
      </div>

      {tab === 'chat' && <ChatPanel />}
      {tab === 'time' && <TeamPanel />}
      {tab === 'projetos' && <ProjectsPanel />}
      {tab === 'custo' && <CostPanel />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px',
        active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent',
      )}
    >
      {icon} {label}
    </button>
  );
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reload = () => { if (internalConfigured) listChat().then(setMessages).catch(console.error); };
  useEffect(() => {
    reload();
    const unsub = subscribeTable('internal_chat_messages', reload);
    return unsub;
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const waiting = messages.length > 0 && messages[messages.length - 1].role === 'user';

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try { await sendChat(text); } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] rounded-xl border border-default bg-surface-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-creme-faint text-[13px] mt-10">
            Converse com o Bukowiski (COO) — distribua trabalho, peça status, autorize.
          </div>
        )}
        {messages.map((m) => <ChatBubble key={m.id} m={m} />)}
        {waiting && (
          <div className="flex items-center gap-2 text-creme-faint text-[12.5px]">
            <Loader2 size={13} className="animate-spin" /> Bukowiski está respondendo…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-default p-2.5 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Mensagem pro Bukowiski…  (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          className="input flex-1 resize-none max-h-32"
        />
        <button onClick={send} disabled={!input.trim() || sending} className="btn btn-accent h-9 px-3 shrink-0">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: ChatMessage }) {
  if (m.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="text-[11.5px] text-creme-faint bg-surface-2 border border-default rounded-full px-3 py-1">
          {m.content}
        </div>
      </div>
    );
  }
  const isUser = m.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] whitespace-pre-wrap leading-relaxed',
          isUser ? 'bg-brand/20 text-creme rounded-br-sm' : 'bg-surface-2 text-creme rounded-bl-sm border border-default',
        )}
      >
        {!isUser && <div className="text-[11px] font-semibold text-brand-bright mb-0.5 flex items-center gap-1"><Bot size={11} /> Bukowiski</div>}
        {m.content}
      </div>
    </div>
  );
}

// ─── TIME (organograma) ───────────────────────────────────────────────────────
const GROUP_LABELS: Record<string, string> = {
  gestao: 'Gestão', tecnologia: 'Tecnologia · Operações', receita: 'Receita · Crescimento',
  cliente: 'Cliente', governanca: 'Governança',
};
const GROUP_ORDER = ['gestao', 'tecnologia', 'receita', 'cliente', 'governanca'];

function TeamPanel() {
  const [agents, setAgents] = useState<InternalAgent[]>([]);
  useEffect(() => {
    if (!internalConfigured) return;
    listAgents().then(setAgents).catch(console.error);
    const u = subscribeTable('internal_agents', () => listAgents().then(setAgents).catch(console.error));
    return u;
  }, []);

  const groups = useMemo(() => {
    const by: Record<string, InternalAgent[]> = {};
    for (const a of agents) (by[a.org_group ?? 'outros'] ??= []).push(a);
    return GROUP_ORDER.filter((g) => by[g]?.length).map((g) => [g, by[g]] as const);
  }, [agents]);

  return (
    <div className="space-y-5">
      <div className="text-[12.5px] text-creme-mute">
        {agents.length} colaboradores · <span className="chip chip-green">{agents.filter((a) => a.scope !== 'client').length} internos</span> <span className="chip">{agents.filter((a) => a.scope === 'client').length} cliente-facing</span>
      </div>
      {groups.map(([g, list]) => (
        <div key={g}>
          <div className="text-[11.5px] font-semibold text-creme-mute uppercase tracking-wide mb-2">{GROUP_LABELS[g] ?? g}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-2.5">
            {list.map((a) => <AgentCard key={a.slug} a={a} />)}
          </div>
        </div>
      ))}
      {agents.length === 0 && <div className="text-[12.5px] text-creme-faint">Nenhum colaborador (Supabase desligado?).</div>}
    </div>
  );
}

function AgentCard({ a }: { a: InternalAgent }) {
  const modelChip: Record<string, string> = { opus: 'chip chip-amber', sonnet: 'chip chip-green', haiku: 'chip' };
  return (
    <div className="rounded-xl border border-default bg-surface-1 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot size={13} className="text-brand-bright shrink-0" />
          <span className="text-[14px] font-bold text-creme truncate">{a.name}</span>
        </div>
        <span className={clsx(a.status === 'active' ? 'chip chip-green' : 'chip', 'text-[10px]')}>{a.status === 'active' ? 'ativo' : 'idle'}</span>
      </div>
      <div className="text-[11.5px] text-brand font-semibold mb-1">{a.sector}</div>
      <div className="text-[11.5px] text-creme-mute leading-snug line-clamp-2 mb-2">{a.description}</div>
      <div className="flex flex-wrap items-center gap-1">
        <span className={clsx(modelChip[a.model_default] ?? 'chip', 'text-[10px]')}>{a.model_default}</span>
        {a.scope === 'client' && <span className="chip chip-blue text-[10px]">cliente-facing</span>}
        {(a.skills ?? []).slice(0, 2).map((s) => <span key={s} className="chip text-[9.5px]">{s}</span>)}
        {(a.skills?.length ?? 0) > 2 && <span className="text-[10px] text-creme-faint">+{(a.skills!.length - 2)}</span>}
      </div>
    </div>
  );
}

// ─── PROJETOS ─────────────────────────────────────────────────────────────────
function ProjectsPanel() {
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');

  const reload = () => {
    if (!internalConfigured) return;
    listProjects().then(setProjects).catch(console.error);
    listPendingAuthorizations().then(setAuths).catch(console.error);
  };
  useEffect(() => {
    reload();
    const u1 = subscribeTable('internal_projects', reload);
    const u2 = subscribeTable('internal_authorizations', reload);
    return () => { u1(); u2(); };
  }, []);

  const submit = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const id = await createProject(title.trim(), brief.trim());
      setTitle(''); setBrief('');
      setSelected(id);
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const sel = projects.find((p) => p.id === selected) ?? null;

  return (
    <div className="space-y-4">
      {auths.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-300 mb-2">
            <ShieldAlert size={14} /> Autorizações pendentes ({auths.length})
          </div>
          <div className="space-y-2">
            {auths.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-default px-3 py-2">
                <div className="min-w-0">
                  <span className="chip chip-amber mr-2 uppercase">{a.category}</span>
                  <span className="text-[13px] text-creme">{a.summary}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => decideAuthorization(a, true).catch(console.error)} className="btn btn-accent h-7 px-2.5 text-[12px]"><CheckCircle2 size={12} /> Autorizar</button>
                  <button onClick={() => decideAuthorization(a, false).catch(console.error)} className="btn h-7 px-2.5 text-[12px]"><XCircle size={12} /> Negar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-4">
        {/* Lista + novo */}
        <div className="space-y-2">
          {!creating ? (
            <button onClick={() => setCreating(true)} className="btn btn-accent w-full h-9">+ Novo projeto</button>
          ) : (
            <div className="rounded-xl border border-default bg-surface-1 p-3 space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do projeto" className="input w-full" autoFocus />
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Brief — o que o Bukowiski deve planejar e executar" rows={4} className="input w-full resize-none" />
              <div className="flex gap-1.5">
                <button onClick={submit} disabled={!title.trim()} className="btn btn-accent flex-1 h-8 text-[12.5px]">Planejar</button>
                <button onClick={() => { setCreating(false); setTitle(''); setBrief(''); }} className="btn h-8 px-3 text-[12.5px]">Cancelar</button>
              </div>
            </div>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={clsx(
                'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                selected === p.id ? 'border-brand bg-brand/[0.06]' : 'border-default bg-surface-1 hover:bg-surface-2',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-creme truncate">{p.title}</span>
                <StatusChip status={p.status} />
              </div>
              <div className="text-[11px] text-creme-faint mt-0.5">
                est ${Number(p.est_cost_usd).toFixed(2)} · gasto ${Number(p.actual_cost_usd).toFixed(2)}
              </div>
            </button>
          ))}
          {projects.length === 0 && <div className="text-[12.5px] text-creme-faint px-1 py-4 text-center">Nenhum projeto ainda.</div>}
        </div>

        {/* Detalhe */}
        <div>
          {sel ? <ProjectDetail project={sel} /> : (
            <div className="rounded-xl border border-default bg-surface-1 h-full flex items-center justify-center text-[13px] text-creme-faint">
              Selecione um projeto pra ver o plano e o progresso.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ project }: { project: InternalProject }) {
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const reload = () => { listTasks(project.id).then(setTasks).catch(console.error); };
  useEffect(() => {
    reload();
    const u = subscribeTable('internal_project_tasks', reload);
    return u;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  return (
    <div className="rounded-xl border border-default bg-surface-1 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-creme">{project.title}</div>
          <div className="text-[12px] text-creme-mute mt-0.5">{project.brief}</div>
        </div>
        <StatusChip status={project.status} />
      </div>

      {project.status === 'awaiting_approval' && (
        <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2">
          <span className="text-[12.5px] text-creme flex-1">Plano pronto — revise e autorize a execução.</span>
          <button onClick={() => approveProject(project.id).catch(console.error)} className="btn btn-accent h-8 px-3 text-[12.5px]"><CheckCircle2 size={13} /> Aprovar e executar</button>
          <button onClick={() => rejectProject(project.id).catch(console.error)} className="btn h-8 px-3 text-[12.5px]">Rejeitar</button>
        </div>
      )}

      {project.plan_md && (
        <div>
          <div className="text-[11.5px] font-semibold text-creme-mute uppercase tracking-wide mb-1.5">Plano</div>
          <pre className="text-[12.5px] text-creme/90 whitespace-pre-wrap font-sans bg-surface-2 border border-default rounded-lg p-3 max-h-72 overflow-y-auto">{project.plan_md}</pre>
        </div>
      )}

      <div>
        <div className="text-[11.5px] font-semibold text-creme-mute uppercase tracking-wide mb-1.5">Tarefas ({tasks.length})</div>
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-lg border border-default bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono text-creme-faint">{t.seq + 1}</span>
                  <span className="text-[13px] text-creme truncate">{t.title}</span>
                  {t.agent_slug && <span className="chip text-[10.5px]">{t.agent_slug}</span>}
                  {t.auth_category && <span className="chip chip-amber text-[10px] uppercase">{t.auth_category}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.cost_usd > 0 && <span className="text-[11px] font-mono text-creme-faint">${Number(t.cost_usd).toFixed(3)}</span>}
                  <TaskStatusChip status={t.status} />
                </div>
              </div>
              {t.output_md && (
                <pre className="mt-2 text-[12px] text-creme/80 whitespace-pre-wrap font-sans bg-surface-1 border border-default rounded p-2 max-h-56 overflow-y-auto">{t.output_md}</pre>
              )}
            </div>
          ))}
          {tasks.length === 0 && <div className="text-[12px] text-creme-faint">Sem tarefas (aguardando planejamento).</div>}
        </div>
      </div>
    </div>
  );
}

// ─── CUSTO ────────────────────────────────────────────────────────────────────
function CostPanel() {
  const [events, setEvents] = useState<CostEvent[]>([]);
  const [settings, setSettings] = useState<InternalSettings | null>(null);

  const reload = () => {
    if (!internalConfigured) return;
    listRecentCost(168).then(setEvents).catch(console.error);
    getSettings().then(setSettings).catch(console.error);
  };
  useEffect(() => {
    reload();
    const u1 = subscribeTable('internal_cost_events', reload);
    const u2 = subscribeTable('internal_settings', reload);
    return () => { u1(); u2(); };
  }, []);

  const { cost5h, costWeek, byAgent } = useMemo(() => {
    const now = Date.now();
    let c5 = 0, cw = 0;
    const agg: Record<string, number> = {};
    for (const e of events) {
      const t = new Date(e.created_at).getTime();
      const cost = Number(e.cost_usd) || 0;
      cw += cost;
      if (now - t <= 5 * 3600_000) c5 += cost;
      const k = e.agent_slug || '—';
      agg[k] = (agg[k] || 0) + cost;
    }
    const byAgent = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    return { cost5h: c5, costWeek: cw, byAgent };
  }, [events]);

  const ceil5h = settings ? Number(settings.cost_ceiling_5h_usd) : 5;
  const ceilWeek = settings ? Number(settings.cost_ceiling_week_usd) : 50;

  return (
    <div className="space-y-4 max-w-3xl">
      {settings?.paused && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          <Power size={14} /> Execução PAUSADA (kill-switch ativo). Nenhuma tarefa nova roda até religar.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Meter label="Janela de 5h" spent={cost5h} ceiling={ceil5h} />
        <Meter label="Semana" spent={costWeek} ceiling={ceilWeek} />
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-semibold text-creme">Kill-switch</span>
          <button
            onClick={() => settings && setPaused(!settings.paused).catch(console.error)}
            className={clsx('btn h-8 px-3 text-[12.5px]', settings?.paused ? 'btn-accent' : '')}
          >
            <Power size={13} /> {settings?.paused ? 'Religar execução' : 'Pausar tudo'}
          </button>
        </div>
        <div className="text-[12px] text-creme-faint">
          Autonomia: <span className="chip">{settings?.autonomy_level ?? '—'}</span> · gates pausam tarefas de money/prod/dns/client.
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-4">
        <div className="text-[11.5px] font-semibold text-creme-mute uppercase tracking-wide mb-2">Custo por colaborador (7 dias)</div>
        {byAgent.length === 0 ? (
          <div className="text-[12.5px] text-creme-faint">Sem custo registrado.</div>
        ) : (
          <div className="space-y-1.5">
            {byAgent.map(([slug, cost]) => (
              <div key={slug} className="flex items-center justify-between text-[13px]">
                <span className="text-creme flex items-center gap-1.5"><Bot size={12} className="text-creme-mute" /> {slug}</span>
                <span className="font-mono text-creme-mute">${cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Meter({ label, spent, ceiling }: { label: string; spent: number; ceiling: number }) {
  const pct = ceiling > 0 ? Math.min(100, (spent / ceiling) * 100) : 0;
  const danger = pct >= 90;
  const warn = pct >= 70 && pct < 90;
  return (
    <div className="rounded-xl border border-default bg-surface-1 p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-creme-mute mb-1"><Clock size={12} /> {label}</div>
      <div className="text-[20px] font-bold text-creme">${spent.toFixed(3)}</div>
      <div className="text-[11px] text-creme-faint mb-2">de ${ceiling.toFixed(2)} ({pct.toFixed(0)}%)</div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', danger ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Chips de status ──────────────────────────────────────────────────────────
function StatusChip({ status }: { status: InternalProject['status'] }) {
  const map: Record<string, string> = {
    draft: 'chip', planning: 'chip chip-amber', awaiting_approval: 'chip chip-amber',
    approved: 'chip', running: 'chip chip-amber', paused: 'chip',
    done: 'chip chip-green', failed: 'chip chip-red',
  };
  const label: Record<string, string> = {
    draft: 'rascunho', planning: 'planejando', awaiting_approval: 'aguarda aprovação',
    approved: 'aprovado', running: 'executando', paused: 'pausado', done: 'concluído', failed: 'falhou',
  };
  return <span className={clsx(map[status] ?? 'chip', 'text-[10.5px] whitespace-nowrap')}>{label[status] ?? status}</span>;
}

function TaskStatusChip({ status }: { status: InternalTask['status'] }) {
  const map: Record<string, string> = {
    pending: 'chip', running: 'chip chip-amber', awaiting_auth: 'chip chip-amber',
    done: 'chip chip-green', failed: 'chip chip-red', skipped: 'chip',
  };
  const label: Record<string, string> = {
    pending: 'pendente', running: 'rodando', awaiting_auth: 'aguarda auth',
    done: 'ok', failed: 'falhou', skipped: 'pulado',
  };
  return <span className={clsx(map[status] ?? 'chip', 'text-[10px] whitespace-nowrap')}>{label[status] ?? status}</span>;
}
