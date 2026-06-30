import { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Trash2, Loader2, Power, Calendar } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listRoutines, createRoutine, setRoutineActive, deleteRoutine, subscribeRoutines,
  WEEKDAYS, type Routine, type ScheduleKind,
} from '@/services/routines';

const BUKOWISKI_ID = 'bukowiski-thribus';

/** Rotinas — demandas recorrentes (cron diário/semanal). A ponte dispara no horário. */
export function RoutinesPanel({ userId, agents }: { userId: string; agents: { id: string; name: string }[] }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const addToast = useAppStore((s) => s.addToast);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  const load = () => listRoutines().then(setRoutines).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); return subscribeRoutines(load); }, []);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12.5px] text-creme-mute">Tarefas que o time executa sozinho, no horário. Ex: <b className="text-creme-dim">toda 2ª 9h — relatório de inadimplência</b>.</p>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-bright transition-colors shrink-0"><Plus size={14} /> Nova rotina</button>
      </div>

      {adding && userId && (
        <RoutineForm userId={userId} agents={agents} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-creme-faint text-[13px] py-6"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : routines.length === 0 ? (
        <div className="text-center text-creme-faint text-[13px] py-10 border border-dashed border-default rounded-xl">Nenhuma rotina ainda. Crie uma pro time rodar algo automaticamente.</div>
      ) : (
        <div className="space-y-2">
          {routines.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${r.active ? 'border-default bg-surface-1' : 'border-default/60 bg-surface-1/40 opacity-60'}`}>
              <Clock size={16} className={r.active ? 'text-brand-bright shrink-0' : 'text-creme-faint shrink-0'} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-creme truncate">{r.title}</div>
                <div className="text-[11px] text-creme-faint flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><Calendar size={10} /> {scheduleLabel(r)}</span>
                  <span>·</span>
                  <span>{agentName(r.agentId)}</span>
                  {r.active && <><span>·</span><span>próx: {fmtNext(r.nextRunAt)}</span></>}
                </div>
              </div>
              <button onClick={() => setRoutineActive(r.id, !r.active).then(load)} title={r.active ? 'Pausar' : 'Ativar'} className={`p-1.5 rounded-lg shrink-0 ${r.active ? 'text-semantic-green hover:bg-semantic-green/10' : 'text-creme-faint hover:text-creme'}`}><Power size={14} /></button>
              <button onClick={async () => { const ok = await useAppStore.getState().askConfirm({ title: 'Apagar rotina', message: r.title, confirmLabel: 'Apagar' }); if (ok) { await deleteRoutine(r.id).catch(() => addToast('Falha ao apagar', 'red')); load(); } }} title="Apagar" className="p-1.5 rounded-lg text-creme-faint hover:text-semantic-red shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function scheduleLabel(r: Routine): string {
  if (r.scheduleKind === 'daily') return `Todo dia às ${r.runTime}`;
  if (r.scheduleKind === 'weekly') return `Toda ${WEEKDAYS[r.weekday] ?? '?'} às ${r.runTime}`;
  return `Todo dia ${r.dayOfMonth} do mês às ${r.runTime}`;
}
function fmtNext(iso: string): string {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function RoutineForm({ userId, agents, onClose, onCreated }: { userId: string; agents: { id: string; name: string }[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [agentId, setAgentId] = useState(BUKOWISKI_ID);
  const [kind, setKind] = useState<ScheduleKind>('daily');
  const [runTime, setRunTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [saving, setSaving] = useState(false);
  const addToast = useAppStore((s) => s.addToast);

  const collaborators = useMemo(
    () => [...agents].sort((a, b) => (a.id === BUKOWISKI_ID ? -1 : b.id === BUKOWISKI_ID ? 1 : a.name.localeCompare(b.name))),
    [agents],
  );

  async function submit() {
    if (!title.trim()) { addToast('Dê um título à rotina', 'amber'); return; }
    setSaving(true);
    try {
      await createRoutine(userId, { title: title.trim(), description: description.trim() || undefined, project: project.trim() || undefined, agentId, scheduleKind: kind, runTime, weekday, dayOfMonth });
      onCreated();
    } catch (e) { addToast((e as Error).message, 'red'); } finally { setSaving(false); }
  }

  return (
    <div className="mb-4 p-4 rounded-xl border border-brand/30 bg-brand/[0.03] space-y-3">
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título — ex: Relatório de inadimplência" autoFocus />
      <textarea className="input min-h-[60px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que o time deve fazer toda vez…" />
      <div className="grid grid-cols-2 gap-3">
        <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Projeto (opcional)" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
          <option value="daily">Diária</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensal</option>
        </select>
        <input type="time" className="input" value={runTime} onChange={(e) => setRunTime(e.target.value)} />
        {kind === 'weekly' && (
          <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
          </select>
        )}
        {kind === 'monthly' && (
          <select className="input" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} title="Dia do mês">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
          </select>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-creme-mute hover:bg-surface-hover">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Criar rotina
        </button>
      </div>
    </div>
  );
}
