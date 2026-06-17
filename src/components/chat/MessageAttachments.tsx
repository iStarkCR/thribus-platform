/**
 * Renderiza os anexos de uma mensagem: imagem (preview), vídeo (player) e
 * arquivo/PDF (chip pra baixar). Busca URL assinada do bucket privado.
 */
import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { attachmentUrl, type Attachment } from '@/services/collaboratorChat';

export function MessageAttachments({ items }: { items: Attachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

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

  return (
    <div className="flex flex-wrap gap-2 mb-1.5">
      {items.map((a) => {
        const url = urls[a.path];
        if (/^image\//.test(a.mime)) {
          return url
            ? <a key={a.path} href={url} target="_blank" rel="noreferrer"><img src={url} alt={a.name} className="max-h-44 rounded-lg border border-default object-cover" /></a>
            : <Chip key={a.path} a={a} />;
        }
        if (/^video\//.test(a.mime)) {
          return url
            ? <video key={a.path} src={url} controls className="max-h-56 max-w-full rounded-lg border border-default" />
            : <Chip key={a.path} a={a} />;
        }
        return <Chip key={a.path} a={a} url={url} />;
      })}
    </div>
  );
}

function Chip({ a, url }: { a: Attachment; url?: string }) {
  const kb = a.size ? `${(a.size / 1024).toFixed(a.size > 1024 * 1024 ? 0 : 1)} ${a.size > 1024 * 1024 ? 'MB' : 'KB'}` : '';
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 border border-default text-[12px] text-creme-dim hover:border-hover max-w-[220px]"
    >
      <FileText size={14} className="shrink-0 text-creme-faint" />
      <span className="truncate">{a.name}</span>
      {kb && <span className="text-creme-faint shrink-0">{kb}</span>}
      {url && <Download size={12} className="opacity-60 shrink-0" />}
    </a>
  );
}
