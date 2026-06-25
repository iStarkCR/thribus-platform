import { useMemo, useState } from 'react';
import { Plus, X, Loader2, Check, Sparkles } from 'lucide-react';
import { createDemand, type Demand } from '@/services/demands';
import { PRIORITIES } from './demandUtils';

const BUKOWISKI_ID = 'bukowiski-thribus';

export function AddDemandModal({
  userId, agents, onClose, onCreated,
}: {
  userId: string;
  agents: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (d: Demand) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [agentId, setAgentId] = useState(BUKOWISKI_ID);
  const [orchestrate, setOrchestrate] = useState(false);
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
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
      const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
      const d = await createDemand(userId, {
        title: title.trim(),
        description: description.trim() || undefined,
        project: project.trim() || undefined,
        agentId: orchestrate ? BUKOWISKI_ID : agentId,
        orchestrate,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        tags,
      });
      onCreated(d);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default shrink-0">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2"><Plus size={16} className="text-brand" /> Nova demanda</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3.5 overflow-y-auto">
          {error && <div className="px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}
          <Field label="Título">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Montar proposta PJ pra Padaria Pão Quente" autoFocus />
          </Field>
          <Field label="Descrição / contexto (o que o time precisa saber)">
            <textarea className="input min-h-[80px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhe a tarefa, links, dados, critério de pronto…" />
          </Field>

          {/* Orquestrador */}
          <button
            onClick={() => setOrchestrate((v) => !v)}
            className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${orchestrate ? 'border-gold/40 bg-gold/10' : 'border-default bg-surface-1 hover:bg-surface-hover'}`}
          >
            <Sparkles size={15} className={`mt-0.5 shrink-0 ${orchestrate ? 'text-gold-bright' : 'text-creme-faint'}`} />
            <div>
              <div className={`text-[12.5px] font-semibold ${orchestrate ? 'text-gold-bright' : 'text-creme-dim'}`}>Deixar o Bukowiski orquestrar</div>
              <div className="text-[11px] text-creme-faint">Ele avalia, executa o que dá e quebra/delega o resto pro time certo.</div>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Projeto (opcional)">
              <input className="input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Ex: CORTEX" />
            </Field>
            <Field label="Responsável">
              <select className="input disabled:opacity-50" value={agentId} disabled={orchestrate} onChange={(e) => setAgentId(e.target.value)}>
                {orchestrate
                  ? <option>Bukowiski decide</option>
                  : collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Prioridade">
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${priority === p.value ? 'border-brand bg-brand/10 text-brand-bright' : 'border-default text-creme-mute hover:bg-surface-hover'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prazo (opcional)">
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Tags (vírgula)">
              <input className="input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="cobrança, urgente" />
            </Field>
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-default flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Adicionar à fila
          </button>
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
