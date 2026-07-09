/**
 * Seletor de visualização do RACIOCÍNIO no chat (rodapé do TalkPage) — como os
 * passos/tool-calls do colaborador aparecem: Normal (só a resposta), Pensando
 * (passo atual + expandir) ou Detalhado (passos abertos ao vivo). A preferência
 * vive em localStorage (ThinkingActivity a lê via useReasoningView).
 */
import { useState } from 'react';
import { Brain, Check } from 'lucide-react';
import { useReasoningView, setReasoningView, type ReasoningView } from '@/components/shared/ThinkingActivity';

const OPTIONS: Array<{ v: ReasoningView; label: string; hint: string }> = [
  { v: 'normal', label: 'Normal', hint: 'Só a resposta — sem passos no chat.' },
  { v: 'pensando', label: 'Pensando', hint: 'Mostra o passo atual; expande quando você quiser.' },
  { v: 'detalhado', label: 'Detalhado', hint: 'Todos os passos abertos, ao vivo.' },
];

export function ReasoningViewBadge() {
  const view = useReasoningView();
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.v === view) ?? OPTIONS[1];
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12.5px] text-creme-faint hover:text-creme-mute transition-colors"
        title="Como o raciocínio do time aparece no chat"
      >
        <Brain size={12} />
        <span>raciocínio · {current.label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 z-50 w-64 rounded-xl border border-default bg-surface-2 p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]">
            <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-creme-faint">Raciocínio</div>
            {OPTIONS.map((o) => (
              <button
                key={o.v}
                onClick={() => { setReasoningView(o.v); setOpen(false); }}
                className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover ${o.v === view ? 'bg-brand/10' : ''}`}
              >
                <span className="w-4 shrink-0 mt-0.5">{o.v === view && <Check size={13} strokeWidth={3} className="text-brand-bright" />}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-creme">{o.label}</span>
                  <span className="block text-[11px] text-creme-faint leading-snug">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
