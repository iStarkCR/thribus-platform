/**
 * Rotinas — demandas recorrentes. O painel cria/edita; a ponte dispara quando
 * next_run_at vence, criando uma demanda e reagendando o próximo.
 */
import { supabase } from '@/lib/supabase';

export type ScheduleKind = 'daily' | 'weekly' | 'monthly';

export interface Routine {
  id: string;
  agentId: string;
  title: string;
  description: string | null;
  project: string | null;
  scheduleKind: ScheduleKind;
  runTime: string;       // HH:MM
  weekday: number;       // 0=dom .. 6=sáb (só weekly)
  dayOfMonth: number;    // 1–31 (só monthly)
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
}

export const routinesConfigured = Boolean(supabase);

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Próximo disparo (hora local) a partir de agora. Mesma lógica usada na ponte. */
export function computeNextRun(kind: ScheduleKind, runTime: string, weekday: number, dayOfMonth = 1): string {
  const [h, m] = (runTime || '09:00').split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h || 0, m || 0, 0, 0);
  if (kind === 'weekly') {
    const wd = ((weekday % 7) + 7) % 7;
    let add = (wd - next.getDay() + 7) % 7;
    if (add === 0 && next <= now) add = 7;
    next.setDate(next.getDate() + add);
  } else if (kind === 'monthly') {
    // dia do mês, clamped ao último dia (31 em fev = 28/29)
    const clampDay = (y: number, mo: number) => Math.min(dayOfMonth, new Date(y, mo + 1, 0).getDate());
    let y = now.getFullYear(), mo = now.getMonth();
    next.setFullYear(y, mo, clampDay(y, mo));
    next.setHours(h || 0, m || 0, 0, 0);
    if (next <= now) {
      mo += 1; if (mo > 11) { mo = 0; y += 1; }
      next.setFullYear(y, mo, clampDay(y, mo));
      next.setHours(h || 0, m || 0, 0, 0);
    }
  } else if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

interface Row {
  id: string; agent_id: string; title: string; description: string | null; project: string | null;
  schedule_kind: ScheduleKind; run_time: string; weekday: number; day_of_month: number | null; active: boolean;
  next_run_at: string; last_run_at: string | null;
}
const toRoutine = (r: Row): Routine => ({
  id: r.id, agentId: r.agent_id, title: r.title, description: r.description, project: r.project,
  scheduleKind: r.schedule_kind, runTime: r.run_time, weekday: r.weekday, dayOfMonth: r.day_of_month ?? 1,
  active: r.active, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at,
});

export async function listRoutines(): Promise<Routine[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('team_routines').select('*').order('next_run_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toRoutine);
}

export async function createRoutine(userId: string, input: {
  title: string; description?: string; project?: string; agentId?: string;
  scheduleKind: ScheduleKind; runTime: string; weekday?: number; dayOfMonth?: number;
}): Promise<Routine> {
  if (!supabase) throw new Error('Supabase não configurado');
  const weekday = input.weekday ?? 1;
  const dayOfMonth = input.dayOfMonth ?? 1;
  const { data, error } = await supabase
    .from('team_routines')
    .insert({
      user_id: userId,
      agent_id: input.agentId ?? 'bukowiski-thribus',
      title: input.title,
      description: input.description ?? null,
      project: input.project ?? null,
      schedule_kind: input.scheduleKind,
      run_time: input.runTime,
      weekday,
      day_of_month: dayOfMonth,
      next_run_at: computeNextRun(input.scheduleKind, input.runTime, weekday, dayOfMonth),
    })
    .select('*')
    .single();
  if (error) throw error;
  return toRoutine(data as Row);
}

export async function setRoutineActive(id: string, active: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('team_routines').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteRoutine(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('team_routines').delete().eq('id', id);
  if (error) throw error;
}

let seq = 0;
export function subscribeRoutines(onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`team-routines:${++seq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_routines' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
