import { useMemo, useState } from 'react';
import { Code2, Lock, Play, Search, Copy } from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_API_ENDPOINTS, type ApiEndpoint } from '@/lib/seed-extras2';

const METHOD_COLOR = {
  GET: 'bg-semantic-green/15 text-semantic-green',
  POST: 'bg-brand/15 text-brand-bright',
  PUT: 'bg-semantic-amber/15 text-semantic-amber',
  PATCH: 'bg-semantic-amber/15 text-semantic-amber',
  DELETE: 'bg-semantic-red/15 text-semantic-red',
};

export function ApiDocsPage() {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>(SEED_API_ENDPOINTS[0]?.id ?? '');

  const tags = useMemo(() => Array.from(new Set(SEED_API_ENDPOINTS.map((e) => e.tag))), []);
  const filtered = useMemo(() => {
    let r = SEED_API_ENDPOINTS;
    if (selectedTag !== 'all') r = r.filter((e) => e.tag === selectedTag);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((e) => e.path.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q));
    return r;
  }, [search, selectedTag]);

  const selected = SEED_API_ENDPOINTS.find((e) => e.id === selectedId);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Code2 size={16} className="text-creme-mute" /> API Reference
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · REST · auth Bearer · {SEED_API_ENDPOINTS.length} endpoints
          </span>
        </div>
        <code className="text-[11.5px] font-mono px-2.5 py-1 rounded-md bg-surface-2 border border-default text-brand-bright">
          api.thribus.com.br/v1
        </code>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-3 h-[calc(100vh-160px)] min-h-[520px]">
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar endpoint..." className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand" />
            </div>
            <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="w-full px-3 py-1.5 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme focus:outline-none focus:border-brand">
              <option value="all">Todas tags</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={clsx(
                  'w-full text-left p-2 rounded-md border transition-all',
                  selectedId === e.id ? 'bg-brand/10 border-brand/30' : 'bg-surface-1 border-default hover:border-hover',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={clsx('text-[10px] font-mono px-1.5 py-px rounded font-bold uppercase tracking-wider', METHOD_COLOR[e.method])}>
                    {e.method}
                  </span>
                  <code className="text-[11.5px] font-mono text-creme truncate flex-1">{e.path}</code>
                </div>
                <div className="text-[10.5px] text-creme-faint mt-1 leading-tight line-clamp-1">{e.summary}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] overflow-y-auto">
          {selected && <EndpointDetail endpoint={selected} />}
        </div>
      </div>
    </>
  );
}

function EndpointDetail({ endpoint: e }: { endpoint: ApiEndpoint }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={clsx('text-[11px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider', METHOD_COLOR[e.method])}>
          {e.method}
        </span>
        <code className="text-[14px] font-mono text-creme bg-surface-1 px-2 py-0.5 rounded-md border border-default">{e.path}</code>
        {e.authRequired && (
          <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-full bg-semantic-amber/15 text-semantic-amber inline-flex items-center gap-1">
            <Lock size={9} /> auth
          </span>
        )}
      </div>

      <h2 className="text-[15px] font-bold text-creme mb-1">{e.summary}</h2>
      <p className="text-[11.5px] text-creme-faint font-mono mb-4">tag: {e.tag}</p>

      {e.requestExample && (
        <div className="mb-4">
          <h4 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-dim mb-1.5">Request body</h4>
          <CodeBlock code={e.requestExample} language="json" />
        </div>
      )}

      {e.responseExample && (
        <div className="mb-4">
          <h4 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-dim mb-1.5">Response (200)</h4>
          <CodeBlock code={e.responseExample} language="json" />
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-default">
        <h4 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-dim mb-2">Try it</h4>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 px-3 py-2 rounded-md bg-surface-1 border border-default text-[12px] font-mono text-creme">
            curl -X {e.method} 'https://api.thribus.com.br{e.path}' -H 'Authorization: Bearer YOUR_TOKEN'
          </code>
          <button className="p-2 rounded-md bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme">
            <Copy size={12} />
          </button>
        </div>
        <button className="px-4 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-brand transition-all">
          <Play size={11} /> Executar
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-default">
        <h4 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-dim mb-2">SDKs</h4>
        <div className="grid grid-cols-2 gap-2">
          <SdkSnippet lang="TypeScript" code={`import { Thribus } from '@thribus/sdk';\nconst t = new Thribus({ token });\nawait t${tsCall(e)};`} />
          <SdkSnippet lang="Python" code={`from thribus import Thribus\nt = Thribus(token=...)\nt${pyCall(e)}`} />
        </div>
      </div>
    </div>
  );
}

function tsCall(e: ApiEndpoint): string {
  if (e.path.includes('/agents/:id/chat')) return `.agents.chat({ id, message })`;
  if (e.path.includes('/agents') && e.method === 'POST') return `.agents.create({...})`;
  if (e.path.includes('/agents')) return `.agents.list()`;
  if (e.path.includes('/customers')) return `.customers.${e.method === 'GET' ? 'get(id)' : 'addFact(id, fact)'}`;
  if (e.path.includes('/knowledge')) return `.knowledge.${e.method === 'GET' ? 'query(baseId, q)' : 'ingest(baseId, doc)'}`;
  if (e.path.includes('/conversations')) return `.inbox.list()`;
  if (e.path.includes('/tools')) return `.tools.execute(id, payload)`;
  return `.call('${e.method}', '${e.path}')`;
}
function pyCall(e: ApiEndpoint): string {
  return tsCall(e).replace(/\?\./g, '.');
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative">
      <pre className="bg-surface-1 border border-default rounded-md p-3 text-[12px] font-mono text-creme-dim overflow-x-auto leading-relaxed whitespace-pre-wrap">{code}</pre>
      <span className="absolute top-2 right-2 text-[10px] font-mono uppercase tracking-wider text-creme-faint">{language}</span>
    </div>
  );
}

function SdkSnippet({ lang, code }: { lang: string; code: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">{lang}</div>
      <pre className="bg-surface-1 border border-default rounded-md p-2.5 text-[11px] font-mono text-creme-mute whitespace-pre-wrap leading-relaxed">{code}</pre>
    </div>
  );
}
