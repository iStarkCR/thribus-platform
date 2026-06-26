/**
 * Visualização de imagem em modal (lightbox) — abre no próprio sistema em vez de
 * uma nova aba do navegador. Controlado pelo store global (openLightbox/closeLightbox),
 * então qualquer imagem (anexo de mensagem, imagem no corpo da resposta) só precisa
 * chamar a action — sem prop-drilling.
 */
import { useEffect } from 'react';
import { X, ExternalLink, Download } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

export function ImageLightbox() {
  const lightbox = useAppStore((s) => s.lightbox);
  const close = useAppStore((s) => s.closeLightbox);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, close]);

  if (!lightbox) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8"
      onClick={close}
    >
      <div className="absolute top-3 right-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <a
          href={lightbox.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir original em nova aba"
          className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <ExternalLink size={16} />
        </a>
        <a
          href={lightbox.url}
          download={lightbox.alt || ''}
          title="Baixar"
          className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <Download size={16} />
        </a>
        <button
          onClick={close}
          title="Fechar (Esc)"
          className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <img
        src={lightbox.url}
        alt={lightbox.alt || ''}
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
