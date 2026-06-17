import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Plus, X, Loader2, Trash2, Check, Folder, AlertTriangle, Send, CornerDownRight } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listDemands, createDemand, updateDemand, deleteDemand, subscribeDemands, replyDemand,
  demandsConfigured, type Demand, type DemandStatus,
} from '@/services/demands';

const BUKOWISKI_ID = 'bukowiski-thribus';

const COLUMNS: { key: DemandStatus; label: string; dot: string; accent: string }[] = [
  { key: 'todo', label: 'A fazer · fila', dot: '#64748b', accent: 'text-creme-mute' },
  { key: 'doing', label: 'Executando', dot: '#3b82f6', accent: 'text-semantic-blue' },
  { key: 'waiting', label: 'Aguardando você', dot: '#f59e0b', accent: 'text-semantic-amber' },
  { key: 'done', label: 'Feito', dot: '#22c55e', accent: 'text-semantic-green' },
  { key: 'error', label: 'Erro', dot: '#ef4444', accent: 'text-semantic-red' },
];

/**
 * Demandas do time Thribus — Kanban. O Charles adiciona demandas/projetos;
 * o Bukowiski (daemon) lê a fila ('A fazer') e executa, movendo o card sozinho.
 */
export function DemandsPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const agents = useAppStore((s) => s.agents);

  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Demand | null>(null);
  const [dragOver, setDragOver] = useState<DemandStatus | null>(null);
  const dragId = useRef<string | null>(null);

  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try { setDemands(await listDemands(userId)); } catch { /* silencioso */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    listDemands(userId).then(setDemands).catch(() => {}).finally(() => setLoading(false));
    return subscribeDemands(userId, refetch);
  }, [userId, refetch]);

  const byStatus = useMemo(() => {
    const m: Record<DemandStatus, Demand[]> = { todo: [], doing: [], waiting: [], done: [], error: [] };
    for (const d of demands) m[d.status]?.push(d);
    return m;
  }, [demands]);

  async function move(id: string, status: DemandStatus) {
    setDemands((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    try { await updateDemand(id, { status }); } catch { refetch(); }
  }
  async function remove(id: string) {
    setDemands((prev) => prev.filter((d) => d.id !== id));
    try { await deleteDemand(id); } catch { refetch(); }
  }

  if (!demandsConfigured) {
    return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado — defina <code className="font-mono text-creme">.env.local</code>.</div>;
  }

  return (
    <div className="p-6">
      <header className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-bold text-creme flex items-center gap-2">
            <ListChecks size={18} className="text-brand" /> Demandas do time
          </h1>
          <p className="text-[12.5px] text-creme-mute mt-0.5">
            Adicione demandas e projetos. O Bukowiski lê a fila <b className="text-creme">A fazer</b> e executa.
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors shrink-0">
          <Plus size={16} /> Nova demanda
        </button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-creme-faint text-[13px]"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="grid grid-cols-5 gap-3 min-h-[60vh]">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver((c) => (c === col.key ? null : c)); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); if (dragId.current) { move(dragId.current, col.key); dragId.current = null; } }}
              className={`rounded-xl border p-2.5 transition-colors ${dragOver === col.key ? 'border-brand/50 bg-brand/[0.04]' : 'border-default bg-surface-1/40'}`}
            >
              <div className="flex items-center justify-between px-1 pb-2.5">
                <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${col.accent}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} /> {col.label}
                </div>
                <span className="text-[11px] text-creme-faint font-mono">{byStatus[col.key].length}</span>
              </div>
              <div className="space-y-2">
                {byStatus[col.key].map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => { dragId.current = d.id; }}
                    onClick={() => setDetail(d)}
                    className="group bg-surface-1 border border-default rounded-lg p-3 cursor-pointer hover:border-brand/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13px] font-semibold text-creme leading-snug">{d.title}</div>
                      <button onClick={(e) => { e.stopPropagation(); remove(d.id); }} className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-semantic-red shrink-0" title="Apagar"><Trash2 size={13} /></button>
                    </div>
                    {d.description && <div className="text-[11.5px] text-creme-mute mt-1 line-clamp-2">{d.description}</div>}
                    {d.status === 'done' && d.result && <div className="text-[11px] text-semantic-green/90 mt-1.5 line-clamp-2">✓ {d.result}</div>}
                    {d.status === 'error' && d.error && <div className="text-[11px] text-semantic-red/90 mt-1.5 line-clamp-2 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {d.error}</div>}
                    <div className="flex items-center gap-2 mt-2 text-[10.5px] text-creme-faint">
                      <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-creme-dim font-medium">{agentName(d.agentId)}</span>
                      {d.project && <span className="flex items-center gap-1"><Folder size={10} /> {d.project}</span>}
                      {d.status === 'doing' && <Loader2 size={11} className="animate-spin text-semantic-blue" />}
                    </div>
                  </div>
                ))}
                {byStatus[col.key].length === 0 && <div className="text-[11px] text-creme-faint/60 italic px-1 py-2">—</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && userId && (
        <AddDemandModal
          userId={userId}
          agents={agents}
          onClose={() => setAddOpen(false)}
          onCreated={(d) => { setDemands((prev) => [d, ...prev]); setAddOpen(false); }}
        />
      )}

      {detail && (
        <DetailModal
          demand={detail}
          userId={userId}
          agentName={agentName}
          onClose={() => setDetail(null)}
          onReplied={(d) => { setDemands((prev) => [d, ...prev]); setDetail(null); }}
        />
      )}
    </div>
  );
}

function AddDemandModal({ userId, agents, onClose, onCreated }: { userId: string; agents: { id: string; name: string }[]; onClose: () => void; onCreated: (d: Demand) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [agentId, setAgentId] = useState(BUKOWISKI_ID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collaborators = useMemo(
    () => [...agents].sort((a, b) => (a.id === BUKOWISKI_ID ? -1 : b.id === BUKOWISKI_ID ? 1 : a.name.localeCompare(b.name))),
    [agents],
  );

  async function submit() {
    if (!title.trim()) { setError('Dê um título à demanda'); return; }
    setSaving(true); setError(null);
    try {
      const d = await createDemand(userId, { title: title.trim(), description: description.trim() || undefined, project: project.trim() || undefined, agentId });
      onCreated(d);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2"><Plus size={16} className="text-brand" /> Nova demanda</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3.5">
          {error && <div className="px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}
          <Field label="Título">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Montar proposta PJ pra Padaria Pão Quente" autoFocus />
          </Field>
          <Field label="Descrição / contexto (o que o Bukowiski precisa saber)">
            <textarea className="input min-h-[90px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhe a tarefa, links, dados, critério de pronto…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Projeto (opcional)">
              <input className="input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Ex: CORTEX" />
            </Field>
            <Field label="Responsável">
              <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-default flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Adicionar à fila
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  demand, userId, agentName, onClose, onReplied,
}: {
  demand: Demand;
  userId: string | null;
  agentName: (id: string) => string;
  onClose: () => void;
  onReplied: (d: Demand) => void;
}) {
  const addToast = useAppStore((s) => s.addToast);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  // Responder faz sentido quando a demanda já rodou (Feito/Aguardando/Erro):
  // o Bukowiski pediu uma decisão ou você quer redirecionar.
  const canReply = userId && (demand.status === 'done' || demand.status === 'waiting' || demand.status === 'error');

  async function send() {
    if (!userId || !reply.trim()) return;
    setSending(true);
    try {
      const child = await replyDemand(userId, demand, reply.trim());
      addToast('Resposta enviada — o Bukowiski vai continuar', 'green');
      onReplied(child);
    } catch (e) {
      addToast((e as Error).message || 'Falha ao enviar resposta', 'red');
      setSending(false);
    }
  }

  const name = agentName(demand.agentId);

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default">
          <div className="text-[15px] font-bold text-creme">{demand.title}</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto text-[13px]">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim">{name}</span>
            {demand.project && <span className="px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim flex items-center gap-1"><Folder size={10} /> {demand.project}</span>}
            <span className="px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim">{demand.status}</span>
            {demand.parentId && <span className="px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim flex items-center gap-1"><CornerDownRight size={10} /> continuação</span>}
          </div>
          {demand.description && <div><div className="text-[11px] font-bold uppercase tracking-wider text-creme-mute mb-1">{demand.parentId ? 'Sua resposta' : 'Demanda'}</div><div className="text-creme-dim whitespace-pre-wrap">{demand.description}</div></div>}
          {demand.result && <div><div className="text-[11px] font-bold uppercase tracking-wider text-semantic-green mb-1">Resultado do {name}</div><div className="text-creme-dim whitespace-pre-wrap">{demand.result}</div></div>}
          {demand.error && <div><div className="text-[11px] font-bold uppercase tracking-wider text-semantic-red mb-1">Erro</div><div className="text-semantic-red whitespace-pre-wrap">{demand.error}</div></div>}

          {/* Responder ao colaborador → vira uma demanda-filho que ele executa */}
          {canReply && (
            <div className="pt-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand-bright mb-1.5 flex items-center gap-1.5">
                <Send size={11} /> Responder ao {name}
              </div>
              <p className="text-[11.5px] text-creme-faint mb-2 leading-snug">
                Decida ou redirecione (ex: <i>"pode publicar no Hub e acionar Bernays e Argos"</i>). Vira uma nova
                demanda na fila, com o contexto desta — ele continua de onde parou.
              </p>
              <textarea
                className="input min-h-[72px] resize-y w-full"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Sua decisão / próximo passo…"
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={send}
                  disabled={sending || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar pro {name}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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
