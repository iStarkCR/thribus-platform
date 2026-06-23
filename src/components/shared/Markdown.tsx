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

import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CodeViewer } from '@/components/shared/CodeViewer';

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
      out.push(<code key={key++} className="font-mono text-[0.88em] bg-surface-3 text-brand-bright px-1.5 py-0.5 rounded-md">{m[8]}</code>);
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

// extrai o float de uma célula (trata R$ 2.749 = 2749, 400,00 = 400).
function parseNum(s: string): number {
  let t = s.replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(?:\.\d{3})*$/.test(t)) t = t.replace(/\./g, '');
  return parseFloat(t) || 0;
}

// Mini gráfico de barras inline quando a tabela tem rótulo + coluna numérica.
function miniChart(header: string[], rows: string[][], idxs: number[]): ReactNode {
  if (rows.length < 2 || rows.length > 10 || idxs.length < 2) return null;
  let numCol = -1;
  for (let c = idxs.length - 1; c >= 1; c--) {
    if (rows.filter((r) => numeric(r[c] ?? '')).length >= Math.ceil(rows.length * 0.7)) { numCol = c; break; }
  }
  if (numCol < 0) return null;
  let labCol = -1;
  for (let c = 0; c < idxs.length; c++) {
    if (c !== numCol && rows.filter((r) => numeric(r[c] ?? '')).length < Math.ceil(rows.length * 0.5)) { labCol = c; break; }
  }
  if (labCol < 0) return null;
  const vals = rows.map((r) => parseNum(r[numCol] ?? ''));
  if (vals.every((v) => v === 0)) return null;
  const max = Math.max(...vals.map((v) => Math.abs(v)), 1);
  return (
    <div className="mt-2 px-3.5 py-3 rounded-xl border border-default bg-surface-1/60">
      <div className="text-[10px] uppercase tracking-[0.08em] text-creme-faint font-semibold mb-2">{header[numCol] || 'valores'}</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-[34%] truncate text-creme-mute text-right shrink-0">{r[labCol]}</span>
            <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(vals[i]) / max) * 100)}%`, background: 'linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand-bright)))' }} />
            </div>
            <span className="w-[18%] shrink-0 text-creme font-mono tabular-nums text-right">{r[numCol]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cards ricos (bloco ```cards) e Confirmação (bloco ```confirm) ──────────
// O time emite esses blocos quando lista entidades / pede confirmação de ação.
const ACCENT_TOKEN: Record<string, string> = {
  green: '--brand-bright', sage: '--brand-bright', brand: '--brand-bright',
  gold: '--gold-bright', amber: '--semantic-amber', blue: '--semantic-blue',
  red: '--semantic-red', violet: '--semantic-blue',
};
function accentVar(a?: string): string { return ACCENT_TOKEN[(a ?? '').toLowerCase()] ?? '--brand-bright'; }
// Sem accent explícito, infere a cor pelo texto do status.
function statusTone(s: string): string {
  const t = s.toLowerCase();
  if (/(pago|ok\b|ativo|conclu|receb|aprovad|online|sucesso|feito|entregue|saud)/.test(t)) return '--brand-bright';
  if (/(pendente|aguard|atras|vence|aberto|parcial|process|andamento)/.test(t)) return '--gold-bright';
  if (/(vencid|inadimpl|erro|falha|cancel|offline|cr[ií]tic|bloque|recus|reprov)/.test(t)) return '--semantic-red';
  return '--semantic-blue';
}

interface CardItem { title?: string; subtitle?: string; value?: string | number; status?: string; accent?: string }
function CardList({ items }: { items: CardItem[] }) {
  return (
    <div className="my-3 flex flex-col gap-2">
      {items.map((it, i) => {
        const acc = it.accent ? accentVar(it.accent) : it.status ? statusTone(String(it.status)) : '--brand-bright';
        return (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-default bg-surface-1/70 px-3.5 py-2.5 transition-colors hover:bg-surface-hover/40" style={{ borderLeft: `3px solid rgb(var(${acc}))` }}>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-creme truncate">{renderInline(String(it.title ?? ''))}</div>
              {it.subtitle != null && <div className="text-[12px] text-creme-mute truncate">{renderInline(String(it.subtitle))}</div>}
            </div>
            <div className="text-right shrink-0">
              {it.value != null && it.value !== '' && <div className="font-mono tabular-nums text-[14px] font-bold text-creme leading-tight">{String(it.value)}</div>}
              {it.status != null && it.status !== '' && (
                <span className="inline-block mt-0.5 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md" style={{ background: `rgb(var(${acc}) / 0.14)`, color: `rgb(var(${acc}))` }}>{String(it.status)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ConfirmData { action?: string; detail?: string; danger?: boolean; confirm?: string; cancel?: string }
function ConfirmCard({ data, onAction }: { data: ConfirmData; onAction?: (t: string) => void }) {
  const [done, setDone] = useState<null | 'ok' | 'no'>(null);
  const tone = data.danger ? '--semantic-red' : '--gold-bright';
  const confirmMsg = data.confirm || `Confirmado: ${data.action}. Pode executar.`;
  const cancelMsg = data.cancel || `Cancela isso — não execute "${data.action}".`;
  return (
    <div className="my-3 rounded-xl px-3.5 py-3" style={{ border: `1px solid rgb(var(${tone}) / 0.4)`, background: `linear-gradient(180deg, rgb(var(${tone}) / 0.08), transparent)` }}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: `rgb(var(${tone}))` }}>
        <AlertTriangle size={13} /> vou executar — confirma?
      </div>
      <div className="text-[14px] text-creme mb-1 leading-snug">{renderInline(String(data.action ?? ''))}</div>
      {data.detail != null && data.detail !== '' && <div className="text-[12.5px] text-creme-mute mb-2.5">{renderInline(String(data.detail))}</div>}
      {done ? (
        <div className="text-[12.5px] font-semibold" style={{ color: done === 'ok' ? 'rgb(var(--brand-bright))' : 'rgb(var(--creme-mute))' }}>
          {done === 'ok' ? '✓ Confirmado' : '✕ Cancelado'}
        </div>
      ) : (
        <div className="flex gap-2 mt-1">
          <button onClick={() => { setDone('ok'); onAction?.(confirmMsg); }} className="px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-opacity hover:opacity-90" style={{ background: `rgb(var(${tone}))`, color: '#0a140a' }}>Confirmar</button>
          <button onClick={() => { setDone('no'); onAction?.(cancelMsg); }} className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium border border-default text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
        </div>
      )}
    </div>
  );
}

export function Markdown({ text, className, onAction }: { text: string; className?: string; onAction?: (t: string) => void }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── bloco de código (só se houver fechamento; senão trata literal) ────
    if (isFence(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      let j = i + 1;
      while (j < lines.length && !isFence(lines[j])) j++;
      if (j < lines.length) {
        const body = lines.slice(i + 1, j).join('\n');
        const lk = lang.toLowerCase();
        // Blocos especiais: cards ricos e confirmação de ação.
        if (lk === 'cards' || lk === 'confirm') {
          try {
            const data = JSON.parse(body);
            if (lk === 'cards') {
              const its = Array.isArray(data) ? data : data?.items;
              if (Array.isArray(its) && its.length) { blocks.push(<CardList key={key++} items={its} />); i = j + 1; continue; }
            } else {
              blocks.push(<ConfirmCard key={key++} data={data} onAction={onAction} />); i = j + 1; continue;
            }
          } catch { /* JSON inválido → cai pro CodeViewer abaixo */ }
        }
        blocks.push(
          <div key={key++} className="my-2">
            <CodeViewer content={body} language={lang || undefined} maxHeight="22rem" />
          </div>,
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
      const chart = miniChart(header, rows, idxs);
      blocks.push(
        <div key={key++} className="my-3">
        <div className="overflow-x-auto rounded-xl border border-default shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)]">
          <table className="w-full text-[14.5px] border-collapse">
            <thead>
              <tr className="bg-surface-3">
                {idxs.map((ci) => (
                  <th key={ci} className="text-left font-semibold text-[11.5px] uppercase tracking-[0.07em] text-creme-mute px-3.5 py-2.5 border-b border-default whitespace-nowrap">{renderInline(header[ci] ?? '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-default/40 last:border-0 hover:bg-surface-hover/50 transition-colors">
                  {idxs.map((ci) => {
                    const cell = r[ci] ?? '';
                    return (
                      <td key={ci} className={`px-3.5 py-2 align-top ${numeric(cell) ? 'text-right font-mono tabular-nums whitespace-nowrap text-creme font-medium' : 'text-creme-dim'}`}>
                        {renderInline(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {chart}
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
    if (line.trim() === '') { blocks.push(<div key={key++} className="h-2.5" />); i++; continue; }

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
