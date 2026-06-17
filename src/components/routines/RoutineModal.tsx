/**
 * Modal de criar rotina (demanda recorrente). Usado na página Rotinas e no
 * menu "+" do chat (prefilled com o texto digitado).
 */
import { useMemo, useState } from 'react';
import { X, Loader2, Clock, Check } from 'lucide-react';
import { createRoutine, WEEKDAYS, type Routine, type ScheduleKind } from '@/services/routines';

const BUKOWISKI_ID = 'bukowiski-thribus';

export function RoutineModal({
  userId, agents, initialTitle, onClose, onCreated,
}: {
  userId: string;
  agents: { id: string; name: string }[];
  initialTitle?: string;
  onClose: () => void;
  onCreated: (r: Routine) => void;
}) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState(BUKOWISKI_ID);
  const [kind, setKind] = useState<ScheduleKind>('daily');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collaborators = useMemo(
    () => [...agents].sort((a, b) => (a.id === BUKOWISKI_ID ? -1 : b.id === BUKOWISKI_ID ? 1 : a.name.localeCompare(b.name))),
    [agents],
  );

  async function submit() {
    if (!title.trim()) { setError('Dê um título à rotina'); return; }
    setSaving(true); setError(null);
    try {
      const r = await createRoutine(userId, {
        title: title.trim(), description: description.trim() || undefined,
        agentId, scheduleKind: kind, runTime: time, weekday,
      });
      onCreated(r);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2"><Clock size={16} className="text-brand" /> Nova rotina</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3.5">
          {error && <div className="px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}
          <Field label="O que repetir">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Relatório de performance do Instagram" autoFocus />
          </Field>
          <Field label="Detalhes (opcional)">
            <textarea className="input min-h-[64px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto, critério de pronto…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequência">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
                <option value="daily">Todo dia</option>
                <option value="weekly">Toda semana</option>
              </select>
            </Field>
            <Field label="Horário">
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          {kind === 'weekly' && (
            <Field label="Dia da semana">
              <div className="flex gap-1">
                {WEEKDAYS.map((w, i) => (
                  <button key={i} onClick={() => setWeekday(i)} className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors ${weekday === i ? 'bg-brand text-white' : 'bg-surface-3 text-creme-mute hover:text-creme'}`}>{w}</button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Responsável">
            <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="px-5 py-3.5 border-t border-default flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Agendar
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
