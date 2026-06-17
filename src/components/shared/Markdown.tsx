/**
 * Markdown leve (sem dependência) pro conteúdo das conversas — o Bukowiski
 * responde em markdown (## títulos, **negrito**, listas, links). Renderiza
 * títulos, listas, negrito, código inline e LINKS CLICÁVEIS (markdown e nus).
 *
 * Não é um parser completo (sem tabelas/aninhamento), mas cobre o que o time usa.
 */

import { type ReactNode } from 'react';

const INLINE = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s)]+)|(\*\*([^*]+?)\*\*)|(`([^`]+?)`)/g;

const linkCls = 'text-brand-bright underline underline-offset-2 hover:text-brand break-words';

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(<a key={key++} href={m[3]} target="_blank" rel="noopener noreferrer" className={linkCls}>{m[2]}</a>);
    } else if (m[4]) {
      let url = m[4];
      let trail = '';
      const t = url.match(/[.,;:)]+$/);
      if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
      out.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className={linkCls}>{url}</a>);
      if (trail) out.push(trail);
    } else if (m[5]) {
      out.push(<strong key={key++} className="font-semibold text-creme">{m[6]}</strong>);
    } else if (m[7]) {
      out.push(<code key={key++} className="font-mono text-[0.9em] bg-surface-3 px-1 py-0.5 rounded">{m[8]}</code>);
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isUl = (l: string) => /^\s*[-*]\s+/.test(l);
  const isOl = (l: string) => /^\s*\d+\.\s+/.test(l);
  const isHeading = (l: string) => /^#{1,4}\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const cls = h[1].length <= 2
        ? 'text-[1.05em] font-bold text-creme mt-2.5 mb-1 first:mt-0'
        : 'text-[1em] font-semibold text-creme mt-1.5 mb-0.5';
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    if (isUl(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>);
        i++;
      }
      blocks.push(<ul key={key++} className="list-disc ml-4 my-1 space-y-0.5">{items}</ul>);
      continue;
    }

    if (isOl(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>);
        i++;
      }
      blocks.push(<ol key={key++} className="list-decimal ml-5 my-1 space-y-0.5">{items}</ol>);
      continue;
    }

    if (line.trim() === '') { blocks.push(<div key={key++} className="h-2" />); i++; continue; }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isHeading(lines[i]) && !isUl(lines[i]) && !isOl(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(para.join('\n'))}</p>);
  }

  return <div className={className}>{blocks}</div>;
}
