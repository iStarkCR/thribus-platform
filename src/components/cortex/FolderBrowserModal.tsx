/**
 * Navegador de pastas in-app — substitui o prompt feio do navegador. Mostra os
 * diretórios reais do Mac do daemon (listados pelo bridge via fs_browse_requests)
 * pra você entrar nas pastas e escolher uma, com caminho absoluto de verdade.
 * Ver [[work-folders]].
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, ChevronRight, ArrowUp, Loader2, X, Check, AlertTriangle, Home } from 'lucide-react';
import { browseFolder, type FsListing } from '@/services/chatSessions';

const parentOf = (p: string) => { const c = p.replace(/\/+$/, ''); const i = c.lastIndexOf('/'); return i > 0 ? c.slice(0, i) : '/'; };

export function FolderBrowserModal({ onClose, onSelect }: { onClose: () => void; onSelect: (path: string) => void }) {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const go = (path: string | null) => {
    setLoading(true); setError(null);
    browseFolder(path)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : 'erro'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { go(null); }, []);

  const base = listing?.base ?? '';
  const segments = base.split('/').filter(Boolean);

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col bg-surface-1 border border-default rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-default shrink-0">
          <div className="flex items-center gap-2 text-[14px] font-bold text-creme"><FolderOpen size={16} className="text-brand-bright" /> Selecionar pasta</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={18} /></button>
        </div>

        {/* Caminho atual / navegação */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-default shrink-0 overflow-x-auto">
          <button onClick={() => go(null)} title="Início (home)" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-creme-mute hover:text-creme hover:bg-surface-hover"><Home size={14} /></button>
          <button onClick={() => base && go(parentOf(base))} disabled={!base} title="Subir um nível" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-creme-mute hover:text-creme hover:bg-surface-hover disabled:opacity-30"><ArrowUp size={14} /></button>
          <div className="flex items-center gap-0.5 text-[11.5px] font-mono text-creme-faint min-w-0">
            {segments.map((seg, i) => {
              const p = '/' + segments.slice(0, i + 1).join('/');
              return (
                <span key={p} className="flex items-center gap-0.5 shrink-0">
                  <ChevronRight size={11} className="text-creme-faint/50" />
                  <button onClick={() => go(p)} className="hover:text-creme truncate max-w-[140px]">{seg}</button>
                </span>
              );
            })}
          </div>
        </div>

        {/* Lista de subpastas */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[220px]">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-2 py-12 text-creme-faint text-[13px]"><Loader2 size={16} className="animate-spin" /> Lendo pasta…</div>
          ) : error ? (
            <div className="flex items-start gap-2 m-2 px-3 py-2.5 rounded-lg bg-semantic-red/10 text-semantic-red text-[12.5px]"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}</div>
          ) : listing && listing.items.length === 0 ? (
            <div className="h-full flex items-center justify-center py-12 text-creme-faint text-[13px] italic">Nenhuma subpasta aqui.</div>
          ) : (
            <div className="space-y-0.5">
              {listing?.items.map((it) => (
                <button key={it.path} onClick={() => go(it.path)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-surface-hover transition-colors group">
                  <Folder size={15} className="text-brand-bright/70 shrink-0" />
                  <span className="flex-1 min-w-0 text-[13.5px] text-creme-dim truncate">{it.name}</span>
                  <ChevronRight size={14} className="shrink-0 text-creme-faint opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé: caminho atual + usar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-default shrink-0">
          <div className="min-w-0 text-[11px] font-mono text-creme-faint truncate" title={base}>{base || '—'}</div>
          <button
            disabled={!base || loading}
            onClick={() => { onSelect(base); onClose(); }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-bright disabled:opacity-40 transition-colors"
          >
            <Check size={15} /> Usar esta pasta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
