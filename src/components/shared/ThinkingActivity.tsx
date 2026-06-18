/**
 * "Bukowiski está pensando…" com um botão pra VER o que está acontecendo por
 * trás: a lista ao vivo dos passos (tool calls) que o colaborador executa.
 */
import { useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { listRunEvents, subscribeRunEvents, type RunEvent } from '@/services/runEvents';

const VERB: Record<string, string> = {
  Bash: 'rodando', Read: 'lendo', Write: 'escrevendo', Edit: 'editando',
  Glob: 'procurando', Grep: 'procurando', WebFetch: 'pesquisando', WebSearch: 'pesquisando',
  Task: 'delegando', Skill: 'usando a skill', SlashCommand: 'usando a skill', TodoWrite: 'planejando',
  Read_and_Write_Apple_Notes: 'nas notas',
};
const verbFor = (label: string | null) => (label && VERB[label]) || `usando ${label || 'ferramenta'}`;

/**
 * "Executado N passos" — o processo que o colaborador fez (tool calls), expansível,
 * numa mensagem/demanda JÁ concluída. Lê os run_events do ref (msg do usuário ou demanda).
 */
export function MessageSteps({ refId, className }: { refId?: string | null; className?: string }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!refId) { setEvents([]); return; }
    let on = true;
    listRunEvents(refId).then((e) => { if (on) setEvents(e); }).catch(() => {});
    return () => { on = false; };
  }, [refId]);

  if (!events.length) return null;

  return (
    <div className={className ?? 'mt-1.5'}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11.5px] text-creme-faint hover:text-creme-mute transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Executado {events.length} {events.length === 1 ? 'passo' : 'passos'}
      </button>
      {open && (
        <div className="mt-1 ml-1 border-l border-default pl-3 space-y-1">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
              <Wrench size={11} className="mt-0.5 shrink-0 text-brand-bright/70" />
              <span className="font-semibold text-creme-mute shrink-0">{verbFor(e.label)}</span>
              {e.detail && <span className="text-creme-faint font-mono break-all">{e.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThinkingActivity({ agentName, refId }: { agentName: string; refId?: string | null }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!refId) { setEvents([]); return; }
    let on = true;
    const refetch = () => listRunEvents(refId).then((e) => { if (on) setEvents(e); }).catch(() => {});
    refetch();
    const unsub = subscribeRunEvents(refId, refetch);
    return () => { on = false; unsub(); };
  }, [refId]);

  const latest = events[events.length - 1];
  const status = latest ? `${verbFor(latest.label)}${latest.detail ? ` ${latest.detail}` : ''}` : 'pensando';

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-brand/15 text-brand-bright flex items-center justify-center text-[12px] font-bold shrink-0">
        {agentName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl rounded-tl-md bg-surface-2 border border-default text-creme-mute text-[14px] max-w-full">
          <Loader2 size={14} className="animate-spin shrink-0" />
          <span className="truncate">{agentName} está <span className="text-creme-dim">{status}</span>…</span>
          {events.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="shrink-0 text-creme-faint hover:text-creme inline-flex items-center gap-0.5 text-[11px]"
              title="Ver o que está acontecendo"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {open ? 'ocultar' : `ver passos (${events.length})`}
            </button>
          )}
        </div>
        {open && events.length > 0 && (
          <div className="mt-1.5 rounded-lg border border-default bg-surface-1 p-2 space-y-1 max-h-52 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
                <Wrench size={11} className="mt-0.5 shrink-0 text-brand-bright" />
                <span className="font-semibold text-creme-mute shrink-0">{verbFor(e.label)}</span>
                {e.detail && <span className="text-creme-faint font-mono break-all">{e.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
