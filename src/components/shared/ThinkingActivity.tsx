/**
 * "Bukowiski está pensando…" com um botão pra VER o que está acontecendo por
 * trás: a lista ao vivo dos passos (tool calls) que o colaborador executa.
 */
import { useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, Wrench, X } from 'lucide-react';
import { listRunEvents, subscribeRunEvents, type RunEvent } from '@/services/runEvents';

/** Linha de um passo — clicável quando tem input/resultado pra abrir o processo. */
function StepRow({ e, onOpen }: { e: RunEvent; onOpen: (e: RunEvent) => void }) {
  const openable = Boolean(e.input || e.result);
  const inner = (
    <>
      <Wrench size={11} className="mt-0.5 shrink-0 text-brand-bright/70" />
      <span className="font-semibold text-creme-mute shrink-0">{verbFor(e.label)}</span>
      {e.detail && <span className="text-creme-faint font-mono break-all">{e.detail}</span>}
      {openable && <ChevronRight size={11} className="shrink-0 text-creme-faint/60 ml-auto self-center" />}
    </>
  );
  return openable ? (
    <button onClick={() => onOpen(e)} className="w-full flex items-start gap-1.5 text-[11.5px] leading-snug text-left hover:bg-surface-hover rounded px-1 -mx-1 py-0.5">{inner}</button>
  ) : (
    <div className="flex items-start gap-1.5 text-[11.5px] leading-snug px-1 py-0.5">{inner}</div>
  );
}

/** Modal com o processo completo de um passo: comando/input + resultado. */
export function StepDetailModal({ event, onClose }: { event: RunEvent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[85] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <div className="text-[13.5px] font-semibold text-creme flex items-center gap-2"><Wrench size={14} className="text-brand-bright" /> {verbFor(event.label)} <span className="font-mono text-[11px] text-creme-faint">{event.label}</span></div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          {event.input && (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-creme-faint mb-1">Comando / input</div>
              <pre className="rounded-lg bg-surface-3 border border-default p-3 font-mono text-[12px] text-creme-dim whitespace-pre-wrap break-words overflow-x-auto">{event.input}</pre>
            </div>
          )}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-creme-faint mb-1">Resultado</div>
            {event.result
              ? <pre className="rounded-lg bg-surface-3 border border-default p-3 font-mono text-[12px] text-creme-mute whitespace-pre-wrap break-words overflow-x-auto max-h-[44vh] overflow-y-auto">{event.result}</pre>
              : <div className="text-creme-faint text-[12px]">(sem saída registrada)</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [detail, setDetail] = useState<RunEvent | null>(null);

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
        <div className="mt-1 ml-1 border-l border-default pl-3 space-y-0.5">
          {events.map((e) => <StepRow key={e.id} e={e} onOpen={setDetail} />)}
        </div>
      )}
      {detail && <StepDetailModal event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export function ThinkingActivity({ agentName, refId }: { agentName: string; refId?: string | null }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RunEvent | null>(null);

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
          <div className="mt-1.5 rounded-lg border border-default bg-surface-1 p-2 space-y-0.5 max-h-52 overflow-y-auto">
            {events.map((e) => <StepRow key={e.id} e={e} onOpen={setDetail} />)}
          </div>
        )}
      </div>
      {detail && <StepDetailModal event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
