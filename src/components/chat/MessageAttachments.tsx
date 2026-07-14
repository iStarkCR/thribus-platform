/**
 * Renderiza os anexos de uma mensagem: imagem (preview), vídeo (player),
 * texto/código (chip com PRÉVIA no viewer) e arquivo/PDF (chip pra baixar).
 */
import { useEffect, useState } from 'react';
import { FileText, Download, Eye } from 'lucide-react';
import { attachmentUrl, type Attachment } from '@/services/collaboratorChat';
import { CodeViewerModal, langFromName } from '@/components/shared/CodeViewer';
import { useAppStore } from '@/hooks/useAppStore';

export function MessageAttachments({ items }: { items: Attachment[] }) {
  const openLightbox = useAppStore((s) => s.openLightbox);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ name: string; content: string; lang?: string } | null>(null);

  useEffect(() => {
    if (!items?.length) return;
    let on = true;
    Promise.all(items.map((a) => attachmentUrl(a.path).then((u) => [a.path, u] as const)))
      .then((pairs) => {
        const ok = pairs.filter((p): p is [string, string] => !!p[1]);
        if (on) setUrls(Object.fromEntries(ok));
      })
      .catch(() => {});
    return () => { on = false; };
  }, [items]);

  if (!items?.length) return null;

  const openPreview = async (a: Attachment) => {
    const url = urls[a.path] ?? (await attachmentUrl(a.path));
    if (!url) return;
    try {
      const txt = await fetch(url).then((r) => r.text());
      setPreview({ name: a.name, content: txt, lang: langFromName(a.name, a.mime) ?? undefined });
    } catch { /* silencioso */ }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-1.5">
        {items.map((a) => {
          const url = urls[a.path];
          if (/^image\//.test(a.mime)) {
            const openGallery = () => {
              const images = items
                .filter((x) => /^image\//.test(x.mime) && urls[x.path])
                .map((x) => ({ url: urls[x.path], alt: x.name }));
              openLightbox(url, a.name, images);
            };
            return url
              ? <button key={a.path} type="button" onClick={openGallery} className="block cursor-zoom-in"><img src={url} alt={a.name} className="max-h-44 rounded-lg border border-default object-cover" /></button>
              : <Chip key={a.path} a={a} />;
          }
          if (/^video\//.test(a.mime)) {
            return url
              ? <video key={a.path} src={url} controls className="max-h-56 max-w-full rounded-lg border border-default" />
              : <Chip key={a.path} a={a} />;
          }
          const textLike = langFromName(a.name, a.mime);
          return <Chip key={a.path} a={a} url={url} onPreview={textLike ? () => openPreview(a) : undefined} />;
        })}
      </div>
      {preview && <CodeViewerModal filename={preview.name} content={preview.content} language={preview.lang} onClose={() => setPreview(null)} />}
    </>
  );
}

function Chip({ a, url, onPreview }: { a: Attachment; url?: string; onPreview?: () => void }) {
  const kb = a.size ? `${(a.size / 1024).toFixed(a.size > 1024 * 1024 ? 0 : 1)} ${a.size > 1024 * 1024 ? 'MB' : 'KB'}` : '';
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface-3 border border-default text-[12px] text-creme-dim max-w-[240px]">
      <FileText size={14} className="shrink-0 text-creme-faint" />
      <span className="truncate">{a.name}</span>
      {kb && <span className="text-creme-faint shrink-0">{kb}</span>}
      {onPreview && (
        <button onClick={onPreview} title="Ver prévia" className="shrink-0 text-creme-faint hover:text-brand-bright ml-0.5"><Eye size={13} /></button>
      )}
      {url && <a href={url} target="_blank" rel="noreferrer" title="Baixar" className="shrink-0 text-creme-faint hover:text-creme"><Download size={12} /></a>}
    </div>
  );
}
