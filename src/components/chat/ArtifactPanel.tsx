/**
 * Painel de artefatos (canvas lateral) — relatórios/análises longas abrem aqui em
 * vez de rolar no meio do chat. Renderiza o markdown do artefato com toolbar
 * (copiar, baixar). PDF/Hub ficam pro próximo passo. Ver [[chat-blocos-ricos]].
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, Copy, Check, Download } from 'lucide-react';
import { Markdown } from '@/components/shared/Markdown';

export interface ArtifactData { title: string; type?: string; content: string }

export function ArtifactPanel({ artifact, onClose }: { artifact: ArtifactData | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!artifact) return null;

  const copy = () => {
    navigator.clipboard?.writeText(artifact.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([artifact.content], { type: 'text/markdown' }));
    a.download = `${artifact.title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'artefato'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-[88] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative h-full w-full max-w-[min(760px,92vw)] flex flex-col bg-surface-1 border-l border-default shadow-2xl animate-[artifactIn_.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes artifactIn{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-default shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={17} className="text-brand-bright shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-creme truncate">{artifact.title}</div>
              {artifact.type && <div className="text-[11px] uppercase tracking-wider text-creme-faint">{artifact.type}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-default text-[12px] text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'copiado' : 'copiar'}
            </button>
            <button onClick={download} title="Baixar .md" className="flex items-center justify-center w-8 h-8 rounded-lg border border-default text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors">
              <Download size={13} />
            </button>
            <button onClick={onClose} title="Fechar" className="flex items-center justify-center w-8 h-8 rounded-lg text-creme-faint hover:text-creme hover:bg-surface-hover transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="text-[15px] leading-[1.7] text-creme max-w-3xl">
            <Markdown text={artifact.content} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
