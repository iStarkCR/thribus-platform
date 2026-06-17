/**
 * Rotinas — demandas recorrentes. Cria/liga/desliga/apaga; a ponte dispara
 * cada uma no horário e joga na fila de Demandas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Loader2, Trash2, Power, Folder } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listRoutines, setRoutineActive, deleteRoutine, subscribeRoutines,
  routinesConfigured, WEEKDAYS, type Routine,
} from '@/services/routines';
import { RoutineModal } from '@/components/routines/RoutineModal';

const fmtNext = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const scheduleText = (r: Routine) =>
  r.scheduleKind === 'daily' ? `Todo dia ${r.runTime}` : `Toda ${WEEKDAYS[r.weekday]} ${r.runTime}`;

export function RoutinesPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const agents = useAppStore((s) => s.agents);
  const addToast = useAppStore((s) => s.addToast);

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const refetch = useCallback(() => { listRoutines().then(setRoutines).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    listRoutines().then(setRoutines).catch(() => {}).finally(() => setLoading(false));
    return subscribeRoutines(refetch);
  }, [refetch]);

  const agentList = useMemo(() => agents.map((a) => ({ id: a.id, name: a.name })), [agents]);

  async function toggle(r: Routine) {
    setRoutines((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    try { await setRoutineActive(r.id, !r.active); } catch { refetch(); }
  }
  async function remove(id: string) {
    setRoutines((prev) => prev.filter((x) => x.id !== id));
    try { await deleteRoutine(id); } catch { refetch(); }
  }

  if (!routinesConfigured) {
    return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado.</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <header className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-bold text-creme flex items-center gap-2">
            <Clock size={18} className="text-brand" /> Rotinas
          </h1>
          <p className="text-[12.5px] text-creme-mute mt-0.5">
            Tarefas que se repetem sozinhas. No horário, viram demanda e o time executa.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors shrink-0">
          <Plus size={16} /> Nova rotina
        </button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-creme-faint text-[13px]"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : routines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-default p-8 text-center text-creme-faint text-[13px]">
          Nenhuma rotina ainda. Crie uma (ex: <i>relatório do Instagram toda segunda 9h</i>).
        </div>
      ) : (
        <div className="space-y-2">
          {routines.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-xl border border-default bg-surface-1 p-3.5 ${!r.active ? 'opacity-55' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-creme truncate">{r.title}</div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11.5px] text-creme-faint">
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-creme-dim flex items-center gap-1"><Clock size={10} /> {scheduleText(r)}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-creme-dim">{agentName(r.agentId)}</span>
                  {r.project && <span className="flex items-center gap-1"><Folder size={10} /> {r.project}</span>}
                  <span>· próximo: {fmtNext(r.nextRunAt)}</span>
                </div>
              </div>
              <button onClick={() => toggle(r)} title={r.active ? 'Pausar' : 'Ativar'} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${r.active ? 'text-brand-bright hover:bg-brand/10' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}>
                <Power size={15} />
              </button>
              <button onClick={() => remove(r.id)} title="Apagar" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-creme-faint hover:text-semantic-red hover:bg-semantic-red/10 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && userId && (
        <RoutineModal
          userId={userId}
          agents={agentList}
          onClose={() => setAdding(false)}
          onCreated={(r) => { setRoutines((prev) => [...prev, r]); setAdding(false); addToast('Rotina agendada', 'green'); }}
        />
      )}
    </div>
  );
}
