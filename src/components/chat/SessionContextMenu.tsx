/**
 * Menu de contexto de uma conversa (estilo Claude): renomear, fixar, cor,
 * mover pra pasta, duplicar, transcrição, arquivar e apagar.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Pin, PinOff, Palette, FolderInput, Files, FileText, Archive, ArchiveRestore, Trash2, ChevronRight, Check } from 'lucide-react';
import type { ChatSession, ChatFolder } from '@/services/chatSessions';

export function SessionContextMenu({
  session, folders, colors, pos, onClose,
  onRename, onTogglePin, onSetColor, onMove, onFork, onTranscript, onToggleArchive, onDelete,
}: {
  session: ChatSession;
  folders: ChatFolder[];
  colors: string[];
  pos: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onSetColor: (color: string | null) => void;
  onMove: (folderId: string | null) => void;
  onFork: () => void;
  onTranscript: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const [sub, setSub] = useState<'color' | 'folder' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: Math.max(8, pos.x - 208), top: pos.y + 4 });
  // Mede o menu DEPOIS de renderizar e o reposiciona pra caber inteiro na tela —
  // sobe quando abre perto da borda de baixo, pra "Apagar" nunca ficar cortado.
  // Recalcula quando um submenu (cor/pasta) expande e muda a altura.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = pos.x - width;                       // abre à esquerda do clique
    if (left < 8) left = Math.min(pos.x + 4, vw - width - 8); // sem espaço → à direita
    left = Math.max(8, Math.min(left, vw - width - 8));
    let top = pos.y + 4;
    if (top + height > vh - 8) top = Math.max(8, vh - height - 8); // não cabe embaixo → sobe
    setCoords({ left, top });
  }, [pos.x, pos.y, sub]);
  const run = (fn: () => void) => () => { fn(); onClose(); };

  // Portal pro body: o menu fica fora de qualquer ancestral com transform/filter
  // (glass/aurora) que faria o `position: fixed` ser relativo ao container em vez
  // da tela — assim a medição acima usa a viewport de verdade e nada é cortado.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[58]" onClick={onClose} />
      <div ref={menuRef} className="fixed z-[59] w-52 bg-surface-1 border border-default rounded-xl shadow-2xl py-1 text-[13px] max-h-[calc(100vh-16px)] overflow-y-auto" style={{ left: coords.left, top: coords.top }}>
        <Row icon={<Pencil size={14} />} label="Renomear" onClick={run(onRename)} />
        <Row icon={session.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />} label={session.pinnedAt ? 'Desafixar' : 'Fixar no topo'} onClick={run(onTogglePin)} />

        <Row icon={<Palette size={14} />} label="Mudar cor" chevron onClick={() => setSub(sub === 'color' ? null : 'color')} active={sub === 'color'} />
        {sub === 'color' && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
            {colors.map((c) => (
              <button key={c} onClick={run(() => onSetColor(c))} className="w-5 h-5 rounded-full border border-default hover:scale-110 transition-transform flex items-center justify-center" style={{ background: c }}>
                {session.color === c && <Check size={12} className="text-white" />}
              </button>
            ))}
            <button onClick={run(() => onSetColor(null))} title="Sem cor" className="w-5 h-5 rounded-full border border-default text-[11px] text-creme-faint flex items-center justify-center">×</button>
          </div>
        )}

        <Row icon={<FolderInput size={14} />} label="Mover pra pasta" chevron onClick={() => setSub(sub === 'folder' ? null : 'folder')} active={sub === 'folder'} />
        {sub === 'folder' && (
          <div className="max-h-40 overflow-y-auto mx-1 my-1 rounded-lg bg-surface-2 p-1">
            <button onClick={run(() => onMove(null))} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12.5px] text-creme-mute hover:bg-surface-hover hover:text-creme">
              Sem pasta {!session.folderId && <Check size={12} className="text-brand-bright" />}
            </button>
            {folders.map((f) => (
              <button key={f.id} onClick={run(() => onMove(f.id))} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-creme-mute hover:bg-surface-hover hover:text-creme">
                <span className="truncate flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color ?? '#64748b' }} /> {f.name}</span>
                {session.folderId === f.id && <Check size={12} className="text-brand-bright shrink-0" />}
              </button>
            ))}
            {folders.length === 0 && <div className="px-2.5 py-1.5 text-[11.5px] text-creme-faint italic">Nenhuma pasta</div>}
          </div>
        )}

        <Row icon={<Files size={14} />} label="Duplicar" onClick={run(onFork)} />
        <Row icon={<FileText size={14} />} label="Ver transcrição" onClick={run(onTranscript)} />

        <div className="my-1 border-t border-default" />
        <Row icon={session.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />} label={session.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={run(onToggleArchive)} />
        <Row icon={<Trash2 size={14} />} label="Apagar" danger onClick={run(onDelete)} />
      </div>
    </>,
    document.body,
  );
}

function Row({ icon, label, onClick, chevron, active, danger }: { icon: React.ReactNode; label: string; onClick: () => void; chevron?: boolean; active?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${danger ? 'text-semantic-red hover:bg-surface-hover' : active ? 'bg-brand/10 text-brand-bright' : 'text-creme-dim hover:bg-surface-hover'}`}
    >
      <span className={`shrink-0 ${danger ? '' : active ? 'text-brand-bright' : 'text-creme-faint'}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {chevron && <ChevronRight size={13} className={`shrink-0 transition-transform ${active ? 'rotate-90' : ''} text-creme-faint`} />}
    </button>
  );
}
