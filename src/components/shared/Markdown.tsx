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

import { memo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, FileText, Check } from 'lucide-react';
import { CodeViewer } from '@/components/shared/CodeViewer';
import { Chart } from '@/components/shared/Chart';
import { useAppStore } from '@/hooks/useAppStore';

// URL aceita parênteses balanceados (ex.: .../Foo_(bar)) sem cortar no 1º ')'.
// IMPORTANTE: classes disjuntas ([^\s()] vs. o grupo \(…\)) — SEM quantificador
// aninhado ambíguo tipo (?:[^\s()]+|…)+, que causava catastrophic backtracking
// (ReDoS) e travava a thread principal quando uma linha começava com URL + token
// longo sem espaço seguido de mais texto (ex.: relatório/artefato com link do Hub).
const URLCORE = 'https?:\\/\\/[^\\s()]*(?:\\([^\\s()]*\\)[^\\s()]*)*';
const INLINE = new RegExp(
  '(\\[([^\\]]+)\\]\\((' + URLCORE + ')\\))|(' + URLCORE + ')|(\\*\\*([^*]+?)\\*\\*)|(`([^`]+?)`)' +
    // itálico _…_ : fronteira não-palavra dos dois lados (m[9]=fronteira, m[10]=_…_, m[11]=conteúdo)
    // — evita snake_case / path_com_underscore. Só `_`, não `*` (colidiria com **bold**/bullets).
    '|(^|[^\\w*])(_([^\\s_][^_]*?)_)(?![\\w])',
  'g',
);
const linkCls = 'text-brand-bright underline underline-offset-2 hover:text-brand break-words';

// Previews: imagem (thumbnail) e PDF (chip). Só http(s) — arquivo local não tem URL.
const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(u);
const isPdfUrl = (u: string) => /\.pdf(\?|#|$)/i.test(u);
const fileName = (u: string) => { try { return decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || u); } catch { return u; } };
// Linha que é SÓ uma imagem (markdown ![alt](url) ou URL de imagem nua) → bloco.
const IMG_LINE = new RegExp('^\\s*(?:!\\[[^\\]]*\\]\\((' + URLCORE + ')\\)|(' + URLCORE + '))\\s*$');
function PdfChip({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-3 border border-default text-[12.5px] text-creme-dim hover:text-creme hover:border-brand/40 transition-colors align-middle no-underline">
      <FileText size={13} className="text-semantic-red shrink-0" /> <span className="truncate max-w-[220px]">{fileName(url)}</span>
    </a>
  );
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      if (isPdfUrl(m[3])) out.push(<PdfChip key={key++} url={m[3]} />);
      else out.push(<a key={key++} href={m[3]} target="_blank" rel="noopener noreferrer" className={linkCls}>{m[2]}</a>);
    } else if (m[4]) {
      let url = m[4];
      let trail = '';
      const t = url.match(/[.,;:]+$/);
      if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
      if (isPdfUrl(url)) out.push(<PdfChip key={key++} url={url} />);
      else out.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className={linkCls}>{url}</a>);
      if (trail) out.push(trail);
    } else if (m[5]) {
      out.push(<strong key={key++} className="font-semibold text-creme">{m[6]}</strong>);
    } else if (m[7]) {
      const code = m[8];
      // URL dentro de crases → link clicável (mantém o visual mono). Resolve o
      // caso comum do agente colar o link entre ` `.
      if (/^https?:\/\/\S+$/.test(code.trim())) {
        out.push(<a key={key++} href={code.trim()} target="_blank" rel="noopener noreferrer" className="font-mono text-[0.88em] bg-surface-3 text-brand-bright px-1.5 py-0.5 rounded-md underline underline-offset-2 hover:text-brand break-all">{code}</a>);
      } else {
        out.push(<code key={key++} className="font-mono text-[0.88em] bg-surface-3 text-brand-bright px-1.5 py-0.5 rounded-md">{code}</code>);
      }
    } else if (m[10]) {
      if (m[9]) out.push(m[9]); // re-emite o char de fronteira consumido pelo match
      out.push(<em key={key++} className="italic">{m[11]}</em>);
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

// Às vezes o agente cola uma string JSON-escapada como PROSA (ex: a definição de
// uma demanda), com `\n`/`\t` LITERAIS (2 chars) em vez de quebras reais. O split
// por '\n' real não pega isso → o blocão aparece cru, com `\n` à mostra. Aqui
// desescapamos esses literais FORA de código:
//   • cercas ```…``` (dentro o `\n` é escape válido de JSON em ```cards/```json —
//     mexer quebraria o JSON.parse / o CodeViewer);
//   • código inline `…` (ali `\n`/`\t` literal pode ser conteúdo de propósito,
//     ex: o agente falando do escape ou de um path — preservado verbatim no split).
function unescapeProseWhitespace(text: string): string {
  if (!text.includes('\\n') && !text.includes('\\t') && !text.includes('\\r')) return text;
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFence(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    // Fatia preservando código inline (`…`): partes ímpares do split são code
    // spans, mantidas verbatim; só a prosa (índices pares) é desescapada. Sem
    // placeholder, sem risco de colisão com números soltos da prosa.
    lines[i] = lines[i].split(/(`[^`]*`)/).map((part, k) =>
      k % 2 === 1 ? part : part.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t'),
    ).join('');
  }
  return lines.join('\n');
}

// Sanitiza newlines reais dentro de valores de string JSON — o agente às vezes
// inclui markdown com quebras de linha no campo "content" do artifact, gerando
// JSON inválido (string literal não pode ter newline real). Parseamos char a char.
function fixJsonNewlines(s: string): string {
  let r = ''; let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { r += c + (s[i + 1] ?? ''); i++; }
      else if (c === '"') { inStr = false; r += c; }
      else if (c === '\n') r += '\\n';
      else if (c === '\r') r += '\\r';
      else if (c === '\t') r += '\\t';
      else r += c;
    } else { if (c === '"') inStr = true; r += c; }
  }
  return r;
}
// Tenta JSON.parse; se falhar por newlines literais, sanitiza e tenta de novo.
// Retorna undefined se ambos falharem — nunca lança.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { /* noop */ }
  try { return JSON.parse(fixJsonNewlines(s)); } catch { /* noop */ }
  return undefined;
}

// ── Marcador de fronteira "raciocínio ↔ resposta final" ──────────────────────
// O Bukowiski fecha respostas de execução com `<!--FINAL-->`: tudo ANTES é
// processo (recolhido num accordion pelo StreamingMarkdown), o que vem DEPOIS é
// a resposta. Aqui ficam o split (usado pelo accordion) e uma limpeza defensiva:
// em qualquer render que NÃO divida (demandas, orbe, voz), o marcador é apenas
// removido pra nunca aparecer cru.
const FINAL_MARKER_RE = /[ \t]*<!--\s*FINAL\s*-->[ \t]*/i;
const FINAL_MARKER_G = /[ \t]*<!--\s*FINAL\s*-->[ \t]*/gi;
export function splitFinalMarker(text: string): { process: string; answer: string } | null {
  const m = FINAL_MARKER_RE.exec(text);
  if (!m) return null;
  const process = text.slice(0, m.index).trim();
  const answer = text.slice(m.index + m[0].length).trim();
  if (!process || !answer) return null; // marcador no começo/fim → trata como ausente
  return { process, answer };
}

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
    <div className="mt-2 px-4 py-3.5 rounded-2xl border border-default/60 bg-surface-1/40">
      <div className="text-[10px] uppercase tracking-[0.1em] text-creme-faint font-semibold mb-2.5">{header[numCol] || 'valores'}</div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="w-[32%] truncate text-creme-mute text-right shrink-0">{r[labCol]}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-3/70 overflow-hidden">
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

// Persistência da escolha (cards e confirmação) em localStorage — sobrevive a sair
// da conversa/modal e a reload. Chave = hash estável do conteúdo do bloco; é
// por-navegador (não sincroniza entre dispositivos). Sem msgId disponível aqui, o
// hash de conteúdo é o suficiente: dois blocos idênticos compartilhariam estado,
// caso raro e aceitável.
function choiceKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'tcard:' + (h >>> 0).toString(36);
}
function loadChoice(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function saveChoice(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* quota/privado/SSR */ }
}

// `action` (opcional): texto enviado ao chat quando o card é clicado — vira uma
// opção selecionável (ex: escolher canal A/B). Sem action, o card é informativo.
interface CardItem { title?: string; subtitle?: string; value?: string | number; status?: string; accent?: string; action?: string }
// `multi`: quando o agente quer deixar escolher VÁRIOS caminhos, emite
// ```cards {"multi":true,"items":[…]} — aí os cards viram toggle + botão "Confirmar".
// Single (default): clicar escolhe na hora, trava e marca a opção escolhida.
function CardList({ items, multi, onAction }: { items: CardItem[]; multi?: boolean; onAction?: (t: string) => void }) {
  const storeKey = choiceKey('cards|' + (multi ? 'm|' : 's|') + items.map((it) => String(it.title ?? '') + '>' + String(it.action ?? '')).join('|'));
  const [selected, setSelected] = useState<Set<number>>(() => {
    const v = loadChoice(storeKey);
    if (!v) return new Set();
    try { return new Set(JSON.parse(v) as number[]); } catch { return new Set(); }
  });
  const [confirmed, setConfirmed] = useState<boolean>(() => loadChoice(storeKey) != null);
  const selectable = Boolean(onAction) && items.some((it) => it.action);

  const pick = (i: number, action: string) => {
    if (confirmed) return;
    if (multi) {
      setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
    } else {
      setSelected(new Set([i]));
      setConfirmed(true);
      saveChoice(storeKey, JSON.stringify([i]));
      onAction?.(action);
    }
  };
  const confirmMulti = () => {
    if (confirmed || selected.size === 0) return;
    const idx = [...selected];
    const msg = idx.map((i) => items[i]?.action).filter(Boolean).join('\n');
    setConfirmed(true);
    saveChoice(storeKey, JSON.stringify(idx));
    onAction?.(msg);
  };

  return (
    <div className="my-3 flex flex-col gap-2">
      {items.map((it, i) => {
        const acc = it.accent ? accentVar(it.accent) : it.status ? statusTone(String(it.status)) : '--brand-bright';
        const clickable = Boolean(it.action) && selectable && !confirmed;
        const isSel = selected.has(i);
        const dimmed = confirmed && !isSel; // depois de escolher, atenua os não escolhidos
        const inner = (
          <>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-creme truncate">{renderInline(String(it.title ?? ''))}</div>
              {it.subtitle != null && <div className="text-[12px] text-creme-mute truncate">{renderInline(String(it.subtitle))}</div>}
            </div>
            <div className="flex items-center gap-2 text-right shrink-0">
              <div>
                {it.value != null && it.value !== '' && <div className="font-mono tabular-nums text-[14px] font-bold text-creme leading-tight">{String(it.value)}</div>}
                {it.status != null && it.status !== '' && (
                  <span className="inline-block mt-0.5 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md" style={{ background: `rgb(var(${acc}) / 0.14)`, color: `rgb(var(${acc}))` }}>{String(it.status)}</span>
                )}
              </div>
              {isSel
                ? <span className="shrink-0 w-5 h-5 rounded-full bg-brand/20 text-brand-bright inline-flex items-center justify-center"><Check size={13} strokeWidth={3} /></span>
                : (it.action && selectable) ? <ChevronRight size={16} className="shrink-0 text-creme-faint" /> : null}
            </div>
          </>
        );
        const base = 'w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all duration-150 shadow-[0_8px_28px_-20px_rgba(0,0,0,0.55)]';
        const selCls = isSel ? 'border-brand/50 bg-brand/8 ring-1 ring-brand/40' : 'border-default/70 bg-surface-1/50';
        return clickable ? (
          <button
            key={i}
            onClick={() => pick(i, it.action!)}
            className={`${base} ${selCls} text-left hover:bg-surface-hover hover:border-brand/50 cursor-pointer`}
            style={{ borderLeft: `3px solid rgb(var(${acc}))` }}
            title={multi ? 'Marcar/desmarcar esta opção' : 'Selecionar esta opção'}
          >
            {inner}
          </button>
        ) : (
          <div key={i} className={`${base} ${selCls} ${dimmed ? 'opacity-50' : ''} ${!isSel ? 'hover:bg-surface-hover/40' : ''}`} style={{ borderLeft: `3px solid rgb(var(${acc}))` }}>
            {inner}
          </div>
        );
      })}
      {multi && selectable && !confirmed && (
        <button
          onClick={confirmMulti}
          disabled={selected.size === 0}
          className="self-start mt-1 px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-opacity bg-brand-bright text-[#0a140a] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirmar seleção{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      )}
      {multi && confirmed && (
        <div className="self-start mt-1 text-[12px] text-brand-bright font-semibold inline-flex items-center gap-1.5"><Check size={14} strokeWidth={3} /> {selected.size} {selected.size === 1 ? 'caminho escolhido' : 'caminhos escolhidos'}</div>
      )}
    </div>
  );
}

// Artefato (bloco ```artifact): documento/relatório longo que abre num painel
// lateral (canvas) em vez de rolar no chat. Sem handler (ex: orbe/voz), cai pro
// conteúdo inline pra não perder nada.
interface ArtifactInfo { title?: string; type?: string; content: string }
function ArtifactChip({ data, onOpen }: { data: ArtifactInfo; onOpen?: (a: { title: string; type?: string; content: string }) => void }) {
  const title = String(data.title || 'Documento');
  if (!onOpen) return <div className="my-2">{/* fallback inline */}<Markdown text={data.content} /></div>;
  return (
    <button
      onClick={() => onOpen({ title, type: data.type, content: data.content })}
      className="my-2 w-full flex items-center gap-3 rounded-xl border border-default bg-surface-1/70 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover hover:border-brand/50"
      title="Abrir no painel"
    >
      <span className="w-9 h-9 rounded-lg bg-brand/12 text-brand-bright flex items-center justify-center shrink-0"><FileText size={17} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-creme truncate">{title}</div>
        <div className="text-[11.5px] text-creme-faint">{data.type ? `${data.type} · ` : ''}abrir no painel</div>
      </div>
      <ChevronRight size={17} className="shrink-0 text-creme-faint" />
    </button>
  );
}

interface ConfirmData { action?: string; detail?: string; danger?: boolean; confirm?: string; cancel?: string }
function ConfirmCard({ data, onAction }: { data: ConfirmData; onAction?: (t: string) => void }) {
  const storeKey = choiceKey('confirm|' + String(data.action ?? '') + '|' + String(data.detail ?? ''));
  const [done, setDone] = useState<null | 'ok' | 'no'>(() => {
    const v = loadChoice(storeKey); return v === 'ok' || v === 'no' ? v : null;
  });
  const tone = data.danger ? '--semantic-red' : '--gold-bright';
  const confirmMsg = data.confirm || `Confirmado: ${data.action}. Pode executar.`;
  const cancelMsg = data.cancel || `Cancela isso — não execute "${data.action}".`;
  // Só dispara onAction no CLIQUE real; ao remontar (escolha já gravada) apenas
  // mostra o estado, sem reenviar a mensagem.
  const choose = (v: 'ok' | 'no', msg: string) => {
    if (done) return;
    setDone(v); saveChoice(storeKey, v); onAction?.(msg);
  };
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
          <button onClick={() => choose('ok', confirmMsg)} className="px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-opacity hover:opacity-90" style={{ background: `rgb(var(${tone}))`, color: '#0a140a' }}>Confirmar</button>
          <button onClick={() => choose('no', cancelMsg)} className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium border border-default text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
        </div>
      )}
    </div>
  );
}

function MarkdownImpl({ text, className, onAction, onOpenArtifact }: { text: string; className?: string; onAction?: (t: string) => void; onOpenArtifact?: (a: { title: string; type?: string; content: string }) => void }) {
  const lines = unescapeProseWhitespace(text.replace(FINAL_MARKER_G, '')).replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const iStart = i; // guard anti-loop (ver fim do laço)
    const line = lines[i];

    // ── bloco de código (só se houver fechamento; senão trata literal) ────
    if (isFence(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      let j = i + 1;
      while (j < lines.length && !isFence(lines[j])) j++;
      if (j < lines.length) {
        const body = lines.slice(i + 1, j).join('\n');
        const lk = lang.toLowerCase();
        // Gráfico (bar/line/donut).
        if (lk === 'chart') {
          const spec = safeJson(body);
          if (spec && Array.isArray(spec.data) && spec.data.length) { blocks.push(<Chart key={key++} spec={spec} />); i = j + 1; continue; }
        }
        // Blocos especiais: cards ricos, confirmação de ação e artefato (canvas).
        // safeJson tenta JSON.parse direto; se falhar (ex: newlines reais no
        // campo "content" do artifact), sanitiza e tenta de novo antes de desistir.
        if (lk === 'cards' || lk === 'confirm' || lk === 'artifact') {
          const data = safeJson(body);
          if (lk === 'cards') {
            const its = Array.isArray(data) ? data : data?.items;
            const multi = !Array.isArray(data) && Boolean(data?.multi);
            if (Array.isArray(its) && its.length) { blocks.push(<CardList key={key++} items={its} multi={multi} onAction={onAction} />); i = j + 1; continue; }
          } else if (lk === 'confirm' && data) {
            blocks.push(<ConfirmCard key={key++} data={data} onAction={onAction} />); i = j + 1; continue;
          } else if (lk === 'artifact' && data && typeof data.content === 'string') {
            blocks.push(<ArtifactChip key={key++} data={data} onOpen={onOpenArtifact} />); i = j + 1; continue;
          }
        }
        blocks.push(
          <div key={key++} className="my-2">
            <CodeViewer content={body} language={lang || undefined} maxHeight="22rem" />
          </div>,
        );
        i = j + 1;
        continue;
      }
      // cerca de abertura sem par (órfã) → ignora a linha da cerca em vez de
      // mostrar um ``` solto e feio (lixo de formatação do agente). O resto do
      // texto segue sendo processado como markdown normal.
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
      // Alinhamento POR COLUNA (cabeçalho + células juntos): coluna numérica →
      // direita, texto → esquerda. Antes o th era sempre à esquerda e os números
      // à direita, então o título não batia com os dados.
      const colNumeric = idxs.map((ci) => {
        const filled = rows.filter((r) => (r[ci] ?? '').trim() !== '');
        return filled.length > 0 && filled.filter((r) => numeric(r[ci] ?? '')).length >= Math.ceil(filled.length * 0.6);
      });
      const chart = miniChart(header, rows, idxs);
      blocks.push(
        <div key={key++} className="my-3">
        <div className="overflow-x-auto rounded-2xl border border-default/60 bg-surface-1/40 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.65)]">
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr>
                {idxs.map((ci) => (
                  <th key={ci} className={`font-semibold text-[10.5px] uppercase tracking-[0.1em] text-creme-faint px-4 py-3 border-b border-default whitespace-nowrap ${colNumeric[ci] ? 'text-right' : 'text-left'}`}>{renderInline(header[ci] ?? '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={`border-b border-default/20 last:border-0 transition-colors hover:bg-surface-hover/40 ${ri % 2 === 1 ? 'bg-surface-2/20' : ''}`}>
                  {idxs.map((ci) => {
                    const cell = r[ci] ?? '';
                    return (
                      <td key={ci} className={`px-4 py-2.5 align-middle ${colNumeric[ci] ? 'text-right font-mono tabular-nums whitespace-nowrap text-creme font-medium' : ci === 0 ? 'text-creme font-medium' : 'text-creme-dim'}`}>
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

    // ── imagem (linha que é só uma imagem) → thumbnail clicável ────────────
    const imgM = line.match(IMG_LINE);
    if (imgM && (imgM[1] || (imgM[2] && isImageUrl(imgM[2])))) {
      const url = imgM[1] || imgM[2];
      blocks.push(
        <button key={key++} type="button" onClick={() => useAppStore.getState().openLightbox(url)} className="block my-2 w-fit cursor-zoom-in">
          <img src={url} alt="" loading="lazy" className="max-h-72 max-w-full rounded-xl border border-default object-contain bg-surface-2" />
        </button>,
      );
      i++;
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
      !isQuote(lines[i]) && !isFence(lines[i]) &&
      // só PARA numa linha de tabela se ela REALMENTE inicia tabela (tem o separador
      // na seguinte); uma `| x |` solta é prosa — senão o laço travava nela.
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(para.join('\n'))}</p>);
    // Rede de segurança: se NENHUM branch consumiu esta linha (ex: linha de tabela
    // `| x |` sem o separador `|---|` na seguinte — o branch de tabela não pega e o
    // de parágrafo a exclui), o cursor ficaria parado → LOOP INFINITO travando a
    // thread ("página sem resposta"). Trata a linha como texto e avança.
    if (i === iStart) { blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(lines[i])}</p>); i++; }
  }

  return <div className={className}>{blocks}</div>;
}

// memo: re-parsear o markdown inteiro custa caro; com props estáveis (text/callbacks)
// evita re-parse quando o pai re-renderiza por outro motivo. Streaming muda o `text`
// a cada tick — aí re-parseia mesmo, como deve.
export const Markdown = memo(MarkdownImpl);
