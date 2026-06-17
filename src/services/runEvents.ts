/**
 * run_events — passos que o colaborador executa "por trás" (tool calls), pra
 * mostrar ao vivo no chat enquanto o "está pensando…" aparece. A ponte grava;
 * o painel assina por ref_id (id da mensagem de chat ou da demanda).
 */
import { supabase } from '@/lib/supabase';

export interface RunEvent {
  id: string;
  kind: string;
  label: string | null;
  detail: string | null;
  createdAt: string;
}

interface Row { id: string; kind: string; label: string | null; detail: string | null; created_at: string; }

export async function listRunEvents(refId: string): Promise<RunEvent[]> {
  if (!supabase || !refId) return [];
  const { data, error } = await supabase
    .from('run_events')
    .select('id,kind,label,detail,created_at')
    .eq('ref_id', refId)
    .order('seq', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map((r) => ({ id: r.id, kind: r.kind, label: r.label, detail: r.detail, createdAt: r.created_at }));
}

let seqN = 0;
export function subscribeRunEvents(refId: string, onChange: () => void): () => void {
  const sb = supabase;
  if (!sb || !refId) return () => {};
  const ch = sb
    .channel(`run-events:${refId}:${++seqN}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'run_events', filter: `ref_id=eq.${refId}` }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
