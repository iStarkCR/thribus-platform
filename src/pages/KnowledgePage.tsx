import { useMemo, useState } from 'react';
import {
  BookOpen, Search, Plus, FileText, Globe, Database, FileSpreadsheet,
  StickyNote, FolderOpen, CheckCircle2, Loader2, AlertTriangle, Clock,
  Bot, RefreshCw, Trash2, TrendingUp, Zap, Hash,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_KNOWLEDGE_BASES, SEED_KNOWLEDGE_SOURCES, SEED_KNOWLEDGE_QUERIES,
  type KnowledgeBase, type KnowledgeSource, type KnowledgeSourceType,
  type KnowledgeSourceStatus,
} from '@/lib/seed-knowledge';
import { useAppStore } from '@/hooks/useAppStore';

const TYPE_ICON: Record<KnowledgeSourceType, typeof FileText> = {
  pdf: FileText,
  url: Globe,
  sheet: FileSpreadsheet,
  notion: StickyNote,
  gdrive: FolderOpen,
  text: FileText,
};

const STATUS_LABEL: Record<KnowledgeSourceStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  ready: { label: 'pronto', color: 'text-semantic-green bg-semantic-green/10', Icon: CheckCircle2 },
  ingesting: { label: 'processando', color: 'text-brand-bright bg-brand/15', Icon: Loader2 },
  failed: { label: 'falhou', color: 'text-semantic-red bg-semantic-red/10', Icon: AlertTriangle },
  stale: { label: 'desatualizado', color: 'text-semantic-amber bg-semantic-amber/10', Icon: Clock },
  idle: { label: 'aguardando', color: 'text-creme-faint bg-surface-3', Icon: Clock },
};

export function KnowledgePage() {
  const [bases] = useState<KnowledgeBase[]>(SEED_KNOWLEDGE_BASES);
  const [sources] = useState<KnowledgeSource[]>(SEED_KNOWLEDGE_SOURCES);
  const [selectedBaseId, setSelectedBaseId] = useState<string>(SEED_KNOWLEDGE_BASES[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [ingestOpen, setIngestOpen] = useState(false);

  const agents = useAppStore((s) => s.agents);

  const selectedBase = useMemo(
    () => bases.find((b) => b.id === selectedBaseId) ?? null,
    [bases, selectedBaseId],
  );

  const baseSources = useMemo(
    () => sources.filter((s) => s.baseId === selectedBaseId),
    [sources, selectedBaseId],
  );

  const recentQueries = useMemo(
    () => SEED_KNOWLEDGE_QUERIES.filter((q) => q.baseId === selectedBaseId).slice(0, 6),
    [selectedBaseId],
  );

  const filteredBases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bases;
    return bases.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    );
  }, [bases, search]);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <BookOpen size={16} className="text-creme-mute" /> Knowledge Base
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · {bases.length} bases · RAG semântico
          </span>
        </div>
        <button
          onClick={() => setIngestOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
        >
          <Plus size={13} /> Nova base
        </button>
      </div>

      <div className="grid grid-cols-[320px_1fr_300px] gap-3 h-[calc(100vh-160px)] min-h-[500px]">
        {/* COL 1 — Lista de bases */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar base..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredBases.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBaseId(b.id)}
                className={clsx(
                  'w-full text-left p-2.5 rounded-lg border transition-all',
                  selectedBaseId === b.id
                    ? 'bg-brand/10 border-brand/30'
                    : 'bg-surface-1 border-default hover:border-hover hover:bg-surface-hover',
                )}
              >
                <div className="flex items-start gap-2">
                  <Database size={14} className="text-brand-bright shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className={clsx(
                      'text-[13px] font-semibold truncate',
                      selectedBaseId === b.id ? 'text-brand-bright' : 'text-creme',
                    )}>
                      {b.name}
                    </div>
                    <div className="text-[11px] text-creme-faint truncate mt-0.5 font-mono">
                      {b.totalChunks} chunks · {b.sizeMB.toFixed(1)} MB
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-dim">
                        {b.attachedAgentIds.length} agente{b.attachedAgentIds.length !== 1 ? 's' : ''}
                      </span>
                      {b.queryCount30d > 1000 && (
                        <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright inline-flex items-center gap-0.5">
                          <Zap size={9} /> {(b.queryCount30d / 1000).toFixed(1)}k/m
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* COL 2 — Detalhe da base + sources */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          {selectedBase ? (
            <>
              <div className="p-5 border-b border-default">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[17px] font-bold text-creme">{selectedBase.name}</h3>
                    <p className="text-[13px] text-creme-mute mt-1 leading-relaxed">{selectedBase.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setIngestOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all"
                    >
                      <Plus size={12} /> Source
                    </button>
                    <button className="p-1.5 rounded-md text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors" title="Reindexar">
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-4">
                  <StatBlock icon={<Hash size={11} />} label="Chunks" value={selectedBase.totalChunks.toLocaleString('pt-BR')} />
                  <StatBlock icon={<FileText size={11} />} label="Tokens" value={`${(selectedBase.totalTokens / 1000).toFixed(0)}k`} />
                  <StatBlock icon={<Database size={11} />} label="Tamanho" value={`${selectedBase.sizeMB.toFixed(1)} MB`} />
                  <StatBlock icon={<Zap size={11} />} label="Queries 30d" value={selectedBase.queryCount30d.toLocaleString('pt-BR')} />
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-default text-[11.5px]">
                  <ConfigPill label="Embedding" value={selectedBase.embeddingModel} />
                  <ConfigPill label="Chunk" value={`${selectedBase.chunkSize} / ${selectedBase.chunkOverlap}`} />
                  <ConfigPill label="Visibilidade" value={selectedBase.visibility === 'workspace' ? 'workspace' : 'privada'} />
                </div>
              </div>

              <div className="px-5 pt-3 pb-2 flex items-center justify-between">
                <h4 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim">
                  Sources ({baseSources.length})
                </h4>
                <span className="text-[11px] text-creme-faint font-mono">
                  Última query: {selectedBase.lastQueryAt ? new Date(selectedBase.lastQueryAt).toLocaleString('pt-BR') : '—'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
                {baseSources.map((s) => {
                  const Icon = TYPE_ICON[s.type];
                  const meta = STATUS_LABEL[s.status];
                  const StatusIcon = meta.Icon;
                  return (
                    <div key={s.id} className="bg-surface-1 border border-default rounded-lg p-3 hover:border-hover transition-all">
                      <div className="flex items-start gap-3">
                        <Icon size={15} className="text-creme-mute shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-creme truncate">{s.title}</span>
                            <span className={clsx('inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-mono', meta.color)}>
                              <StatusIcon size={10} className={s.status === 'ingesting' ? 'animate-spin' : ''} />
                              {meta.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-creme-faint truncate font-mono mt-1">{s.uri}</div>
                          {s.error && (
                            <div className="text-[11.5px] text-semantic-amber mt-1.5">⚠ {s.error}</div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-creme-faint font-mono">
                            <span>{s.chunks} chunks</span>
                            <span>·</span>
                            <span>{(s.tokens / 1000).toFixed(0)}k tokens</span>
                            <span>·</span>
                            <span>sync {new Date(s.lastSyncedAt).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button className="p-1.5 rounded-md text-creme-mute hover:text-creme hover:bg-surface-hover" title="Reindexar">
                            <RefreshCw size={12} />
                          </button>
                          <button className="p-1.5 rounded-md text-semantic-red/70 hover:text-semantic-red hover:bg-semantic-red/10" title="Remover">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {baseSources.length === 0 && (
                  <div className="text-center p-8 text-[12.5px] text-creme-faint italic">
                    Sem sources nessa base ainda. Adicione um documento, URL ou planilha.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-creme-faint">
              <div className="text-center">
                <BookOpen size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-[13px]">Selecione uma base</p>
              </div>
            </div>
          )}
        </div>

        {/* COL 3 — Agentes vinculados + queries recentes */}
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <h3 className="text-[13px] font-bold text-creme flex items-center gap-1.5">
              <Bot size={13} className="text-brand-bright" /> Agentes com acesso
            </h3>
            <p className="text-[11px] text-creme-faint mt-0.5">
              {selectedBase?.attachedAgentIds.length ?? 0} agente{(selectedBase?.attachedAgentIds.length ?? 0) !== 1 ? 's' : ''} pode{(selectedBase?.attachedAgentIds.length ?? 0) === 1 ? '' : 'm'} consultar
            </p>
          </div>

          <div className="p-2 space-y-1.5 border-b border-default">
            {selectedBase?.attachedAgentIds.map((aid) => {
              const a = agents.find((ag) => ag.id === aid);
              return (
                <div key={aid} className="flex items-center gap-2 p-2 rounded-lg bg-surface-1 border border-default">
                  <div className="w-6 h-6 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
                    <Bot size={12} className="text-brand-bright" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-creme truncate">{a?.name ?? aid}</div>
                    <div className="text-[11px] text-creme-faint truncate">{a?.client ?? '—'}</div>
                  </div>
                </div>
              );
            })}
            {(!selectedBase?.attachedAgentIds.length) && (
              <p className="text-[11.5px] text-creme-faint italic p-2">Nenhum agente vinculado.</p>
            )}
            <button className="w-full mt-1 py-1.5 rounded-md text-[11.5px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme transition-colors flex items-center justify-center gap-1">
              <Plus size={11} /> Vincular agente
            </button>
          </div>

          <div className="p-3 border-b border-default">
            <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim flex items-center gap-1.5">
              <TrendingUp size={11} /> Queries recentes
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {recentQueries.map((q) => (
              <div key={q.id} className="p-2 rounded-md bg-surface-1 border border-default">
                <div className="text-[12px] text-creme leading-snug line-clamp-2">{q.query}</div>
                <div className="flex items-center gap-2 mt-1 text-[10.5px] font-mono text-creme-faint">
                  <span className="text-brand-bright">{q.hits}/{q.topK} hits</span>
                  <span>·</span>
                  <span>{q.latencyMs}ms</span>
                  <span>·</span>
                  <span>{new Date(q.timestamp).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
                </div>
              </div>
            ))}
            {recentQueries.length === 0 && (
              <p className="text-[11.5px] text-creme-faint italic p-2">Sem queries recentes.</p>
            )}
          </div>
        </div>
      </div>

      {ingestOpen && (
        <IngestSourceModal onClose={() => setIngestOpen(false)} baseName={selectedBase?.name ?? ''} />
      )}
    </>
  );
}

function StatBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-1 rounded-lg p-2.5 border border-default">
      <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">
        {icon} {label}
      </div>
      <div className="text-[16px] font-bold text-creme font-mono mt-1">{value}</div>
    </div>
  );
}

function ConfigPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className="text-[12px] font-mono text-creme-dim mt-0.5 truncate">{value}</div>
    </div>
  );
}

function IngestSourceModal({ onClose, baseName }: { onClose: () => void; baseName: string }) {
  const [type, setType] = useState<KnowledgeSourceType>('pdf');
  const [uri, setUri] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-xl w-[480px] max-w-[90vw] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-creme">Adicionar source</h3>
        <p className="text-[12px] text-creme-faint mt-1">
          {baseName ? `Em "${baseName}".` : 'Nova base.'} O conteúdo é chunked + embedded com pgvector pra retrieval semântico.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-creme-dim">Tipo</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {(['pdf', 'url', 'sheet', 'notion', 'gdrive', 'text'] as KnowledgeSourceType[]).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={clsx(
                      'p-2 rounded-md border text-[12px] font-medium flex items-center gap-1.5 transition-all',
                      type === t
                        ? 'bg-brand/10 border-brand/40 text-brand-bright'
                        : 'bg-surface-2 border-default text-creme-mute hover:border-hover',
                    )}
                  >
                    <Icon size={12} /> {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-creme-dim">URI ou upload</label>
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder={type === 'url' ? 'https://...' : type === 'pdf' ? 'box://... ou upload local' : 'caminho do recurso'}
              className="w-full mt-1.5 px-3 py-2 rounded-md bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 rounded-md text-[12.5px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            onClick={onClose}
            disabled={!uri}
            className="px-4 py-1.5 rounded-md text-[12.5px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ingerir
          </button>
        </div>
      </div>
    </div>
  );
}
