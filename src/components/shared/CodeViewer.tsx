/**
 * Viewer de código/texto (estilo "Ver prévia"): cabeçalho com linguagem + copiar,
 * numeração de linha e destaque de sintaxe LEVE (sem dependência — tokenizer
 * próprio que respeita strings/comentários). Serve pra blocos de código do chat,
 * prévia de anexos de texto e docs.
 */
import { useState } from 'react';
import { Copy, Check, X, FileCode2 } from 'lucide-react';

const KW = new Set(
  ('import,from,export,default,const,let,var,function,return,if,else,for,while,switch,case,break,continue,' +
    'interface,type,class,extends,implements,new,async,await,public,private,protected,readonly,static,void,' +
    'number,string,boolean,object,any,unknown,never,true,false,null,undefined,this,super,typeof,instanceof,as,' +
    'in,of,do,try,catch,finally,throw,yield,enum,namespace,declare,abstract,get,set,select,insert,update,delete,' +
    'from,where,def,print,return,end,then,fn,use,pub')
    .split(','),
);

const CLS: Record<string, string> = {
  cmt: 'text-creme-faint italic',
  str: 'text-emerald-300/90',
  num: 'text-sky-300/90',
  kw: 'text-violet-300/90',
  id: 'text-creme-dim',
  pun: 'text-creme-mute',
};

type Tok = { t: string; c: string };
function tokenizeLine(line: string, state: { block: boolean }): Tok[] {
  const out: Tok[] = [];
  const push = (t: string, c: string) => { if (t) out.push({ t, c }); };
  let i = 0;
  if (state.block) {
    const end = line.indexOf('*/');
    if (end === -1) { push(line, 'cmt'); return out; }
    push(line.slice(0, end + 2), 'cmt'); state.block = false; i = end + 2;
  }
  while (i < line.length) {
    const ch = line[i];
    const two = line.slice(i, i + 2);
    if (two === '//' || ch === '#') { push(line.slice(i), 'cmt'); break; }
    if (two === '/*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) { push(line.slice(i), 'cmt'); state.block = true; break; }
      push(line.slice(i, end + 2), 'cmt'); i = end + 2; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
      push(line.slice(i, Math.min(j + 1, line.length)), 'str'); i = j + 1; continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i; while (j < line.length && /[0-9a-fA-FxX._]/.test(line[j])) j++;
      push(line.slice(i, j), 'num'); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i; while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const w = line.slice(i, j); push(w, KW.has(w) ? 'kw' : 'id'); i = j; continue;
    }
    push(ch, 'pun'); i++;
  }
  return out;
}

export function CodeViewer({ content, language, className, maxHeight = '58vh' }: {
  content: string; language?: string; className?: string; maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = content.replace(/\n$/, '').split('\n');
  const state = { block: false };
  const rows = lines.map((ln) => tokenizeLine(ln, state)); // sequencial → estado do bloco /* */ persiste

  const copy = () => {
    navigator.clipboard?.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className={`rounded-lg border border-default bg-surface-3/50 overflow-hidden ${className || ''}`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-default bg-surface-2">
        <span className="text-[10.5px] font-mono uppercase tracking-wide text-creme-faint">{language || 'texto'}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[11px] text-creme-faint hover:text-creme transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'copiado' : 'copiar'}
        </button>
      </div>
      <div className="overflow-auto font-mono text-[12px] leading-[1.6]" style={{ maxHeight }}>
        <table className="border-collapse">
          <tbody>
            {rows.map((toks, idx) => (
              <tr key={idx}>
                <td className="select-none text-right px-3 text-creme-faint/40 align-top whitespace-nowrap" style={{ width: 1 }}>{idx + 1}</td>
                <td className="pr-4 whitespace-pre align-top">{toks.map((t, k) => <span key={k} className={CLS[t.c]}>{t.t}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Versão modal (cabeçalho "Arquivo" + nome), pra prévia de anexos/docs. */
export function CodeViewerModal({ filename, content, language, onClose }: {
  filename: string; content: string; language?: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[85] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 size={16} className="text-brand-bright shrink-0" />
            <span className="text-[13.5px] font-mono text-creme truncate">{filename}</span>
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme shrink-0"><X size={18} /></button>
        </div>
        <div className="p-3 overflow-hidden">
          <CodeViewer content={content} language={language} maxHeight="74vh" />
        </div>
      </div>
    </div>
  );
}

/** Detecta extensão/linguagem pelo nome/mime — pra escolher se mostra prévia. */
export function langFromName(name: string, mime?: string): string | null {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json', md: 'md', markdown: 'md',
    css: 'css', scss: 'scss', html: 'html', xml: 'xml', yml: 'yaml', yaml: 'yaml',
    sql: 'sql', py: 'python', sh: 'bash', bash: 'bash', env: 'env', txt: 'texto', csv: 'csv', log: 'log',
  };
  if (map[ext]) return map[ext];
  if (mime && (mime.startsWith('text/') || mime === 'application/json')) return 'texto';
  return null;
}
