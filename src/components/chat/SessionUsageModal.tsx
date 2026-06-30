/**
 * Histórico de sessões com uso — tokens consumidos, custo e tamanho do contexto
 * por conversa. Acionado pelo botão "Uso por sessão" no header do chat.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, BarChart3, Loader2, ArrowUpDown, MessageSquare } from 'lucide-react';
import { getSessionsUsage, getSessionsChannels, type ChatSession, type ChatFolder, type SessionUsage } from '@/services/chatSessions';

const CONTEXT_MAX = 1_000_000; // janela do Opus 4.8

// Canal de origem da sessão. Só 'thribus' (painel) tem contexto medido pelo
// nosso bridge; canais externos gravam por conta própria (valor não-confiável).
const CHANNELS: Record<string, { label: string; cls: string }> = {
  thribus: { label: 'Painel', cls: 'bg-brand/15 text-brand-bright' },
  telegram: { label: 'Telegram', cls: 'bg-sky-500/15 text-sky-300' },
  talki: { label: 'WhatsApp', cls: 'bg-emerald-500/15 text-emerald-300' },
  whatsapp: { label: 'WhatsApp', cls: 'bg-emerald-500/15 text-emerald-300' },
};
const channelMeta = (c: string | undefined) => CHANNELS[c ?? 'thribus'] ?? { label: c ?? '—', cls: 'bg-surface-3 text-creme-faint' };

const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtUsd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

type SortKey = 'recent' | 'context' | 'tokens' | 'cost' | 'runs';

interface Row {
  session: ChatSession;
  folderName: string | null;
  usage: SessionUsage | null;
}

export function SessionUsageModal({
  agentId, agentName, sessions, folders, activeId, onClose, onOpenSession,
}: {
  agentId: string;
  agentName: string;
  sessions: ChatSession[];
  folders: ChatFolder[];
  activeId: string | null;
  onClose: () => void;
  onOpenSession: (id: string) => void;
}) {
  const [usage, setUsage] = useState<Map<string, SessionUsage> | null>(null);
  const [channels, setChannels] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('recent');

  useEffect(() => {
    let alive = true;
    Promise.all([getSessionsUsage(agentId), getSessionsChannels(agentId).catch(() => new Map<string, string>())])
      .then(([u, ch]) => { if (alive) { setUsage(u); setChannels(ch); } })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [agentId]);

  // Contexto só é confiável pras sessões do painel (canal 'thribus').
  const isPanel = (id: string) => (channels.get(id) ?? 'thribus') === 'thribus';

  const folderName = useMemo(() => {
    const m = new Map(folders.map((f) => [f.id, f.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [folders]);

  const rows: Row[] = useMemo(
    () => sessions.map((s) => ({ session: s, folderName: folderName(s.folderId), usage: usage?.get(s.id) ?? null })),
    [sessions, usage, folderName],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'context': return (isPanel(b.session.id) ? b.session.contextTokens : 0) - (isPanel(a.session.id) ? a.session.contextTokens : 0);
        case 'tokens': return (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0);
        case 'cost': return (b.usage?.costUsd ?? 0) - (a.usage?.costUsd ?? 0);
        case 'runs': return (b.usage?.runs ?? 0) - (a.usage?.runs ?? 0);
        default: return new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime();
      }
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, channels]);

  const totals = useMemo(() => {
    let tokens = 0, cost = 0, runs = 0;
    for (const u of usage?.values() ?? []) { tokens += u.totalTokens; cost += u.costUsd; runs += u.runs; }
    return { tokens, cost, runs };
  }, [usage]);

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default shrink-0">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2">
            <BarChart3 size={16} className="text-brand" /> Uso por sessão — {agentName}
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>

        {/* Resumo */}
        <div className="px-5 py-3 border-b border-default grid grid-cols-4 gap-3 shrink-0">
          <Stat label="Sessões" value={String(sessions.length)} />
          <Stat label="Execuções" value={String(totals.runs)} />
          <Stat label="Tokens (total)" value={fmtTokens(totals.tokens)} />
          <Stat label="Custo (total)" value={fmtUsd(totals.cost)} />
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-6 text-[13px] text-semantic-red">Falha ao carregar uso: {error}</div>
          ) : !usage ? (
            <div className="p-10 flex items-center justify-center text-creme-faint"><Loader2 size={18} className="animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-creme-faint">Nenhuma sessão ainda.</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr className="text-creme-faint text-[11px] uppercase tracking-wider border-b border-default">
                  <Th>Sessão</Th>
                  <Th sortable active={sortKey === 'context'} onClick={() => setSortKey('context')} align="right">Contexto</Th>
                  <Th sortable active={sortKey === 'tokens'} onClick={() => setSortKey('tokens')} align="right">Tokens</Th>
                  <Th sortable active={sortKey === 'cost'} onClick={() => setSortKey('cost')} align="right">Custo</Th>
                  <Th sortable active={sortKey === 'runs'} onClick={() => setSortKey('runs')} align="right">Exec.</Th>
                  <Th sortable active={sortKey === 'recent'} onClick={() => setSortKey('recent')} align="right">Atividade</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ session: s, folderName: fn, usage: u }) => {
                  const pct = Math.min(100, (s.contextTokens / CONTEXT_MAX) * 100);
                  const meta = channelMeta(channels.get(s.id));
                  const panel = isPanel(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => { onOpenSession(s.id); onClose(); }}
                      className={`border-b border-default/60 cursor-pointer transition-colors hover:bg-surface-hover ${s.id === activeId ? 'bg-brand/[0.06]' : ''}`}
                    >
                      <td className="px-4 py-2.5 max-w-[280px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare size={13} className="text-creme-faint shrink-0" />
                          <span className="text-creme-dim truncate font-medium">{s.title}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${meta.cls}`}>{meta.label}</span>
                        </div>
                        {fn && <div className="text-[10.5px] text-creme-faint pl-[21px] truncate">{fn}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {panel ? (
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 85 ? 'bg-amber-400' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="font-mono text-creme-mute">{fmtTokens(s.contextTokens)}</span>
                          </div>
                        ) : (
                          <span className="font-mono text-creme-faint" title="Sem dado confiável — o contexto de canal externo não é medido pelo painel">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-creme-mute whitespace-nowrap">{u ? fmtTokens(u.totalTokens) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-creme-mute whitespace-nowrap">{u ? fmtUsd(u.costUsd) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-creme-faint whitespace-nowrap">{u?.runs ?? 0}</td>
                      <td className="px-4 py-2.5 text-right text-creme-faint whitespace-nowrap">{fmtDate(u?.lastAt ?? s.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-default text-[11px] text-creme-faint shrink-0 leading-relaxed">
          <span className="font-semibold text-creme-mute">Contexto</span> = janela atual da conversa (X/1M) — só medido nas sessões do <span className="text-brand-bright">Painel</span>. <span className="font-semibold text-creme-mute">Tokens</span> = total processado nas execuções. Canais externos (Telegram/WhatsApp) rodam por outro bridge, então aparecem com "—".
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-default px-3 py-2">
      <div className="text-[10.5px] text-creme-faint uppercase tracking-wider">{label}</div>
      <div className="text-[16px] font-bold text-creme font-mono">{value}</div>
    </div>
  );
}

function Th({ children, sortable, active, onClick, align = 'left' }: { children: React.ReactNode; sortable?: boolean; active?: boolean; onClick?: () => void; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-brand-bright' : ''}`}>
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-creme transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {children} <ArrowUpDown size={11} className="opacity-60" />
        </button>
      ) : children}
    </th>
  );
}
