/**
 * Markdown leve (sem dependência) pro conteúdo das conversas. O time responde
 * em markdown; aqui renderizamos de forma rica e DINÂMICA:
 *   • tabelas (GFM) → tabela estilizada, com scroll horizontal (dados!)
 *   • blocos de código ``` ``` → <pre> mono
 *   • títulos, listas, citações, negrito, código inline
 *   • LINKS clicáveis (markdown e nus), abrem em nova aba
 *
 * Não é um parser completo, mas cobre o que o time usa pra mostrar dados.
 */

import { type ReactNode } from 'react';

// URL aceita parênteses balanceados (ex.: .../Foo_(bar)) sem cortar no 1º ')'.
const URLCORE = 'https?:\\/\\/(?:[^\\s()]+|\\([^\\s()]*\\))+';
const INLINE = new RegExp(
  '(\\[([^\\]]+)\\]\\((' + URLCORE + ')\\))|(' + URLCORE + ')|(\\*\\*([^*]+?)\\*\\*)|(`([^`]+?)`)',
  'g',
);
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
      const t = url.match(/[.,;:]+$/);
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

// split de célula respeitando pipe escapado (\|), sem lookbehind (compat).
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const PH = '\u0000';
  return s.replace(/\\\|/g, PH).split('|').map((c) => c.split(PH).join('|').trim());
}

const isUl = (l: string) => /^\s*[-*]\s+/.test(l);
const isOl = (l: string) => /^\s*\d+\.\s+/.test(l);
const isHeading = (l: string) => /^#{1,4}\s+/.test(l);
const isQuote = (l: string) => /^\s*>\s?/.test(l);
const isFence = (l: string) => /^\s*```/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /-/.test(l) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l);
// número de verdade: moeda opcional, sinal, dígitos/separadores, % opcional.
const numeric = (s: string) => { const t = s.trim(); return /\d/.test(t) && /^(US\$|R\$|\$)?\s*[+-]?[\d.,]+\s*%?$/.test(t); };

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── bloco de código (só se houver fechamento; senão trata literal) ────
    if (isFence(line)) {
      let j = i + 1;
      while (j < lines.length && !isFence(lines[j])) j++;
      if (j < lines.length) {
        blocks.push(
          <pre key={key++} className="my-2 overflow-x-auto rounded-lg bg-surface-3 border border-default p-3 text-[12px] font-mono text-creme-dim leading-relaxed">
            <code>{lines.slice(i + 1, j).join('\n')}</code>
          </pre>,
        );
        i = j + 1;
        continue;
      }
      // sem cerca de fechamento → não engole o resto: renderiza a linha literal
      blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(line)}</p>);
      i++;
      continue;
    }

    // ── tabela (dados) ───────────────────────────────────────────────────
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);
      const idxs = Array.from({ length: cols }, (_, k) => k);
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-surface-2">
                {idxs.map((ci) => (
                  <th key={ci} className="text-left font-bold text-creme px-2.5 py-1.5 border-b border-default whitespace-nowrap">{renderInline(header[ci] ?? '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-surface-1/50' : ''}>
                  {idxs.map((ci) => {
                    const cell = r[ci] ?? '';
                    return (
                      <td key={ci} className={`px-2.5 py-1.5 border-b border-default/50 text-creme-dim align-top ${numeric(cell) ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''}`}>
                        {renderInline(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // ── citação ──────────────────────────────────────────────────────────
    if (isQuote(line)) {
      const buf: string[] = [];
      while (i < lines.length && isQuote(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      blocks.push(
        <blockquote key={key++} className="my-1.5 border-l-2 border-brand/50 pl-3 text-creme-mute whitespace-pre-wrap">{renderInline(buf.join('\n'))}</blockquote>,
      );
      continue;
    }

    // ── título ───────────────────────────────────────────────────────────
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const cls = h[1].length <= 2
        ? 'text-[1.05em] font-bold text-creme mt-2.5 mb-1 first:mt-0'
        : 'text-[1em] font-semibold text-creme mt-1.5 mb-0.5';
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    // ── lista não ordenada ───────────────────────────────────────────────
    if (isUl(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>);
        i++;
      }
      blocks.push(<ul key={key++} className="list-disc ml-4 my-1 space-y-0.5">{items}</ul>);
      continue;
    }

    // ── lista ordenada ───────────────────────────────────────────────────
    if (isOl(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>);
        i++;
      }
      blocks.push(<ol key={key++} className="list-decimal ml-5 my-1 space-y-0.5">{items}</ol>);
      continue;
    }

    // ── linha em branco ──────────────────────────────────────────────────
    if (line.trim() === '') { blocks.push(<div key={key++} className="h-2" />); i++; continue; }

    // ── parágrafo ────────────────────────────────────────────────────────
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !isHeading(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) &&
      !isQuote(lines[i]) && !isFence(lines[i]) && !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(para.join('\n'))}</p>);
  }

  return <div className={className}>{blocks}</div>;
}
