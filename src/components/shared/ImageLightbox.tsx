/**
 * Visualização de imagem em modal (lightbox) — abre no próprio sistema em vez de
 * uma nova aba do navegador. Controlado pelo store global (openLightbox/closeLightbox),
 * então qualquer imagem (anexo de mensagem, imagem no corpo da resposta) só precisa
 * chamar a action — sem prop-drilling.
 */
import { useEffect } from 'react';
import { X, ExternalLink, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

export function ImageLightbox() {
  const lightbox = useAppStore((s) => s.lightbox);
  const close = useAppStore((s) => s.closeLightbox);
  const setIndex = useAppStore((s) => s.setLightboxIndex);

  const total = lightbox?.images.length ?? 0;
  const hasMultiple = total > 1;
  const prev = () => lightbox && setIndex((lightbox.index - 1 + total) % total);
  const next = () => lightbox && setIndex((lightbox.index + 1) % total);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && hasMultiple) prev();
      else if (e.key === 'ArrowRight' && hasMultiple) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, close, hasMultiple]);

  if (!lightbox) return null;
  const current = lightbox.images[lightbox.index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8"
      onClick={close}
    >
      <div className="absolute top-3 right-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {hasMultiple && (
          <span className="px-2.5 h-9 rounded-lg bg-white/10 text-white text-[12.5px] inline-flex items-center">
            {lightbox.index + 1}/{total}
          </span>
        )}
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir original em nova aba"
          className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <ExternalLink size={16} />
        </a>
        <a
          href={current.url}
          download={current.alt || ''}
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
      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          title="Anterior (←)"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <img
        src={current.url}
        alt={current.alt || ''}
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          title="Próxima (→)"
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center transition-colors"
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}
