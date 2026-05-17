import { useMemo, useState } from 'react';
import {
  Inbox, Search, MessageSquare, Mail, Phone, Globe, Instagram,
  Paperclip, Bot, Send, Sparkles, AlertTriangle, Languages,
  StickyNote, Zap, LayoutList, LayoutGrid, Brain,
  ChevronDown, AtSign, Wand2,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_INBOX_CONVERSATIONS, SEED_INBOX_MESSAGES,
  type InboxConversation, type InboxChannel, type InboxStatus,
} from '@/lib/seed-inbox';
import {
  SEED_INTENTS, SEED_SUGGESTIONS, SEED_ALERTS, SEED_SUMMARIES,
  SEED_NOTES, SEED_MACROS, BOARD_LANES, BOARD_MAPPING,
} from '@/lib/seed-inbox-extras';

const CHANNEL_ICON: Record<InboxChannel, typeof MessageSquare> = {
  whatsapp: MessageSquare, email: Mail, phone: Phone, web: Globe, instagram: Instagram,
};
const CHANNEL_COLOR: Record<InboxChannel, string> = {
  whatsapp: 'text-semantic-green', email: 'text-brand-bright', phone: 'text-semantic-amber',
  web: 'text-creme-mute', instagram: 'text-semantic-red',
};
const STATUS_META: Record<InboxStatus, { label: string; color: string }> = {
  open: { label: 'aberta', color: 'bg-semantic-green/15 text-semantic-green' },
  pending: { label: 'aguardando', color: 'bg-semantic-amber/15 text-semantic-amber' },
  escalated: { label: 'escalada', color: 'bg-semantic-red/15 text-semantic-red' },
  closed: { label: 'fechada', color: 'bg-surface-3 text-creme-faint' },
};

export function InboxPage() {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>(SEED_INBOX_CONVERSATIONS[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [showMacros, setShowMacros] = useState(false);
  const [translateOn, setTranslateOn] = useState(false);

  const filtered = useMemo(() => {
    let r = SEED_INBOX_CONVERSATIONS;
    if (filter !== 'all') r = r.filter((c) => c.status === filter);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((c) => c.customerName.toLowerCase().includes(q) || c.lastPreview.toLowerCase().includes(q));
    return [...r].sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }, [search, filter]);

  const selected = useMemo(() => SEED_INBOX_CONVERSATIONS.find((c) => c.id === selectedId) ?? null, [selectedId]);
  const messages = useMemo(() => SEED_INBOX_MESSAGES.filter((m) => m.conversationId === selectedId), [selectedId]);
  const intent = SEED_INTENTS.find((i) => i.conversationId === selectedId);
  const suggestion = SEED_SUGGESTIONS.find((s) => s.conversationId === selectedId);
  const alerts = SEED_ALERTS.filter((a) => a.conversationId === selectedId);
  const summary = SEED_SUMMARIES.find((s) => s.conversationId === selectedId);
  const notes = SEED_NOTES.filter((n) => n.conversationId === selectedId);

  const acceptSuggestion = () => suggestion && setDraft(suggestion.body);
  const insertMacro = (body: string) => {
    setDraft(body.replace('{nome}', selected?.customerName.split(' ')[0] ?? '').replace('{agente}', selected?.assignedAgentName ?? 'agente').replace('{valor}', '99,90'));
    setShowMacros(false);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Inbox size={16} className="text-creme-mute" /> Inbox Unificada
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · co-pilot · macros · tradução · notas internas · kanban
          </span>
        </div>
        <div className="flex items-center bg-surface-2 border border-default rounded-md p-0.5">
          <button onClick={() => setView('list')} className={clsx('px-2.5 py-1 rounded-[5px] text-[11.5px] font-semibold flex items-center gap-1 transition-all', view === 'list' ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute')}>
            <LayoutList size={12} /> Lista
          </button>
          <button onClick={() => setView('board')} className={clsx('px-2.5 py-1 rounded-[5px] text-[11.5px] font-semibold flex items-center gap-1 transition-all', view === 'board' ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute')}>
            <LayoutGrid size={12} /> Kanban
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="grid grid-cols-[360px_1fr_320px] gap-3 h-[calc(100vh-160px)] min-h-[520px]">
          <ConversationListPanel
            search={search} setSearch={setSearch}
            filter={filter} setFilter={setFilter}
            conversations={filtered}
            selectedId={selectedId} onSelect={setSelectedId}
          />

          <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
            {selected ? (
              <>
                <ChatHeader conversation={selected} translateOn={translateOn} onTranslate={() => setTranslateOn(!translateOn)} />
                <MessagesList messages={messages} translateOn={translateOn} />
                <NotesThread notes={notes} />
                <Composer
                  draft={draft} setDraft={setDraft}
                  mode={composerMode} setMode={setComposerMode}
                  showMacros={showMacros} setShowMacros={setShowMacros}
                  onMacro={insertMacro}
                  channels={selected.channels}
                  suggestion={suggestion}
                  onAccept={acceptSuggestion}
                />
              </>
            ) : null}
          </div>

          <CopilotPanel conversation={selected} intent={intent} alerts={alerts} summary={summary} />
        </div>
      ) : (
        <BoardView onSelect={(id) => { setSelectedId(id); setView('list'); }} />
      )}
    </>
  );
}

function ConversationListPanel({ search, setSearch, filter, setFilter, conversations, selectedId, onSelect }: {
  search: string; setSearch: (v: string) => void;
  filter: InboxStatus | 'all'; setFilter: (f: InboxStatus | 'all') => void;
  conversations: InboxConversation[]; selectedId: string; onSelect: (id: string) => void;
}) {
  const counts = {
    all: SEED_INBOX_CONVERSATIONS.length,
    open: SEED_INBOX_CONVERSATIONS.filter((c) => c.status === 'open').length,
    pending: SEED_INBOX_CONVERSATIONS.filter((c) => c.status === 'pending').length,
    escalated: SEED_INBOX_CONVERSATIONS.filter((c) => c.status === 'escalated').length,
  };
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
      <div className="p-3 border-b border-default space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa..." className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand" />
        </div>
        <div className="flex items-center gap-1 text-[11.5px]">
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="todas" count={counts.all} />
          <FilterBtn active={filter === 'open'} onClick={() => setFilter('open')} label="abertas" count={counts.open} />
          <FilterBtn active={filter === 'pending'} onClick={() => setFilter('pending')} label="pend." count={counts.pending} />
          <FilterBtn active={filter === 'escalated'} onClick={() => setFilter('escalated')} label="esc." count={counts.escalated} alert />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((c) => <ConversationRow key={c.id} conversation={c} selected={c.id === selectedId} onClick={() => onSelect(c.id)} />)}
      </div>
    </div>
  );
}

function ChatHeader({ conversation: s, translateOn, onTranslate }: { conversation: InboxConversation; translateOn: boolean; onTranslate: () => void }) {
  return (
    <div className="p-4 border-b border-default flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-surface-3 border border-default flex items-center justify-center text-[12px] font-bold text-creme-mute">
        {s.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
      </div>
      <div className="flex-1">
        <h3 className="text-[14px] font-bold text-creme">{s.customerName}</h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          {s.channels.map((ch) => {
            const Icon = CHANNEL_ICON[ch];
            return <span key={ch} title={ch}><Icon size={11} className={CHANNEL_COLOR[ch]} /></span>;
          })}
          <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full', STATUS_META[s.status].color)}>
            {STATUS_META[s.status].label}
          </span>
        </div>
      </div>
      <button onClick={onTranslate} className={clsx('p-1.5 rounded-md transition-colors', translateOn ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:bg-surface-hover')} title="Traduzir automaticamente">
        <Languages size={13} />
      </button>
      {s.assignedAgentName && (
        <div className="text-right">
          <div className="text-[10.5px] uppercase tracking-wider text-creme-faint">Atribuído</div>
          <div className="text-[12px] font-semibold text-brand-bright inline-flex items-center gap-1">
            <Bot size={10} /> {s.assignedAgentName}
          </div>
        </div>
      )}
    </div>
  );
}

function MessagesList({ messages, translateOn }: { messages: typeof SEED_INBOX_MESSAGES; translateOn: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m) => {
        const Icon = CHANNEL_ICON[m.channel];
        return (
          <div key={m.id} className={clsx('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
            <div className={clsx(
              'max-w-[75%] p-3 rounded-2xl',
              m.direction === 'out' ? 'bg-brand/15 text-creme rounded-tr-sm' : 'bg-surface-1 border border-default text-creme-mute rounded-tl-sm',
            )}>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.body}</p>
              {translateOn && m.direction === 'in' && (
                <p className="text-[11.5px] italic text-creme-faint mt-1.5 pt-1.5 border-t border-default leading-relaxed">
                  <Languages size={9} className="inline mr-1" /> [traduzido] {m.body}
                </p>
              )}
              {m.attachments?.map((a) => (
                <div key={a.name} className="text-[11.5px] text-creme-faint inline-flex items-center gap-1 mt-2">
                  <Paperclip size={10} /> {a.name}
                </div>
              ))}
              <div className="flex items-center gap-1.5 mt-1.5 text-[10.5px] font-mono text-creme-faint">
                <Icon size={9} className={CHANNEL_COLOR[m.channel]} />
                <span>{m.sender}</span>
                {m.isBot && <span className="text-brand-bright">· bot</span>}
                <span>· {new Date(m.timestamp).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotesThread({ notes }: { notes: typeof SEED_NOTES }) {
  if (notes.length === 0) return null;
  return (
    <div className="border-t border-semantic-amber/30 bg-semantic-amber/5 px-4 py-2 max-h-[120px] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider font-bold text-semantic-amber/80 mb-1.5 flex items-center gap-1">
        <StickyNote size={9} /> Notas internas ({notes.length})
      </div>
      <div className="space-y-1.5">
        {notes.map((n) => (
          <div key={n.id} className="text-[11.5px] leading-snug">
            <span className="font-bold text-creme">{n.authorName}:</span>{' '}
            <span className="text-creme-mute">{renderMentions(n.body)}</span>
            <span className="text-[10px] font-mono text-creme-faint ml-1">· {new Date(n.timestamp).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderMentions(body: string) {
  return body.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-brand-bright font-semibold">{part}</span>
      : <span key={i}>{part}</span>
  );
}

function Composer({
  draft, setDraft, mode, setMode, showMacros, setShowMacros, onMacro, channels, suggestion, onAccept,
}: {
  draft: string; setDraft: (v: string) => void;
  mode: 'reply' | 'note'; setMode: (m: 'reply' | 'note') => void;
  showMacros: boolean; setShowMacros: (v: boolean) => void;
  onMacro: (body: string) => void;
  channels: InboxChannel[];
  suggestion?: typeof SEED_SUGGESTIONS[0];
  onAccept: () => void;
}) {
  return (
    <div className="border-t border-default">
      {suggestion && (
        <div className="px-3 pt-2 pb-1 bg-brand/5 border-b border-brand/20">
          <div className="flex items-start gap-2">
            <Wand2 size={12} className="text-brand-bright shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-brand-bright mb-0.5 flex items-center gap-1">
                Sugestão IA <span className="text-creme-faint font-mono normal-case">· conf {(suggestion.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="text-[12px] text-creme-mute leading-relaxed">{suggestion.body}</p>
              <p className="text-[10.5px] text-creme-faint mt-1 italic">↳ {suggestion.reasoning}</p>
            </div>
            <button onClick={onAccept} className="px-2 py-1 rounded-md bg-brand-dim border border-brand text-creme text-[11px] font-semibold shrink-0">
              Usar
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pt-2 flex items-center gap-1 text-[11.5px]">
        <button onClick={() => setMode('reply')} className={clsx('px-2 py-1 rounded-md font-semibold', mode === 'reply' ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute')}>
          Responder
        </button>
        <button onClick={() => setMode('note')} className={clsx('px-2 py-1 rounded-md font-semibold inline-flex items-center gap-1', mode === 'note' ? 'bg-semantic-amber/15 text-semantic-amber' : 'text-creme-mute')}>
          <StickyNote size={11} /> Nota interna
        </button>
      </div>

      <div className="p-3 flex items-center gap-2 relative">
        {mode === 'reply' && (
          <select className="px-2 py-1.5 rounded-md bg-surface-1 border border-default text-[12px] text-creme focus:outline-none">
            {channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        )}

        <button onClick={() => setShowMacros(!showMacros)} className="p-2 rounded-lg bg-surface-1 border border-default text-creme-mute hover:text-creme" title="Macros / quick replies">
          <Zap size={13} />
        </button>

        {showMacros && (
          <div className="absolute bottom-full left-3 mb-2 w-[360px] max-h-[320px] overflow-y-auto bg-surface-1 border border-default rounded-lg shadow-2xl z-10">
            <div className="p-2 border-b border-default text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">Macros</div>
            {SEED_MACROS.map((m) => (
              <button key={m.id} onClick={() => onMacro(m.body)} className="w-full text-left p-2.5 hover:bg-surface-hover border-b border-default last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-[11px] font-mono px-1 py-px rounded bg-brand/10 text-brand-bright">{m.shortcode}</code>
                  <span className="text-[12.5px] font-semibold text-creme">{m.title}</span>
                  <span className="ml-auto text-[10px] font-mono text-creme-faint">{m.usage30d}/30d</span>
                </div>
                <p className="text-[11.5px] text-creme-mute leading-snug line-clamp-2">{m.body}</p>
              </button>
            ))}
          </div>
        )}

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={mode === 'note' ? 'Nota interna (use @ pra mencionar alguém)...' : 'Resposta humana — ou clique "Usar" pra aceitar sugestão IA'}
          className={clsx(
            'flex-1 px-3 py-2 rounded-lg border text-[13px] placeholder-creme-faint focus:outline-none',
            mode === 'note' ? 'bg-semantic-amber/5 border-semantic-amber/30 text-creme focus:border-semantic-amber' : 'bg-surface-1 border-default text-creme focus:border-brand',
          )}
        />

        {mode === 'note' && <AtSign size={13} className="text-semantic-amber" />}

        <button className={clsx(
          'p-2 rounded-lg border text-creme transition-all',
          mode === 'note' ? 'bg-semantic-amber/15 border-semantic-amber hover:bg-semantic-amber/25' : 'bg-brand-dim border-brand hover:bg-brand',
        )}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function CopilotPanel({ conversation, intent, alerts, summary }: {
  conversation: InboxConversation | null;
  intent?: typeof SEED_INTENTS[0];
  alerts: typeof SEED_ALERTS;
  summary?: typeof SEED_SUMMARIES[0];
}) {
  if (!conversation) return <div className="bg-surface-2 border border-default rounded-[10px]" />;
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
      <div className="p-3 border-b border-default flex items-center gap-1.5">
        <Sparkles size={12} className="text-brand-bright" />
        <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim">Co-pilot</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {summary && (
          <Section icon={<Brain size={11} />} title="Resumo">
            <p className="text-[12px] text-creme-mute leading-relaxed">{summary.body}</p>
            <div className="mt-2 pt-2 border-t border-default">
              <div className="text-[10px] uppercase tracking-wider font-bold text-brand-bright mb-1">Próxima ação</div>
              <p className="text-[12px] text-creme">{summary.nextAction}</p>
            </div>
          </Section>
        )}

        {intent && (
          <Section icon={<Wand2 size={11} />} title="Intenção detectada">
            <div className="text-[12.5px] text-creme leading-relaxed">{intent.primary}</div>
            <div className="text-[10.5px] font-mono text-creme-faint mt-1">conf {(intent.confidence * 100).toFixed(0)}%</div>
            {intent.secondary && <div className="text-[11.5px] text-creme-faint mt-1.5">+ {intent.secondary}</div>}
          </Section>
        )}

        {alerts.length > 0 && (
          <Section icon={<AlertTriangle size={11} />} title={`Alertas (${alerts.length})`}>
            <div className="space-y-1.5">
              {alerts.map((a) => (
                <div key={a.id} className={clsx(
                  'p-2 rounded-md text-[11.5px] leading-snug',
                  a.level === 'critical' ? 'bg-semantic-red/10 text-semantic-red border border-semantic-red/20' :
                  a.level === 'warning' ? 'bg-semantic-amber/10 text-semantic-amber border border-semantic-amber/20' :
                  'bg-brand/10 text-brand-bright border border-brand/20',
                )}>
                  <code className="text-[9.5px] font-mono uppercase tracking-wider opacity-70">{a.category}</code>
                  <div className="mt-0.5">{a.message}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section icon={<ChevronDown size={11} />} title="Ações rápidas">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn label="Resumir" />
            <ActionBtn label="Sentimento +" />
            <ActionBtn label="Escalar" />
            <ActionBtn label="Pegar" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function ActionBtn({ label }: { label: string }) {
  return <button className="px-2 py-1.5 rounded-md bg-surface-1 border border-default text-[11.5px] text-creme-mute hover:border-hover hover:text-creme">{label}</button>;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2.5">
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1">
        <span className="text-brand-bright">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function BoardView({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-3 h-[calc(100vh-160px)] min-h-[500px]">
      {BOARD_LANES.map((lane) => {
        const items = SEED_INBOX_CONVERSATIONS.filter((c) => BOARD_MAPPING[c.id] === lane.id);
        return (
          <div key={lane.id} className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-default flex items-center justify-between">
              <span className={clsx('text-[11.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', lane.color)}>
                {lane.label}
              </span>
              <span className="text-[11px] font-mono text-creme-faint">{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((c) => (
                <button key={c.id} onClick={() => onSelect(c.id)} className="w-full text-left p-2.5 bg-surface-1 border border-default rounded-md hover:border-brand/30 transition-all">
                  <div className="text-[12.5px] font-semibold text-creme truncate">{c.customerName}</div>
                  <p className="text-[11px] text-creme-mute leading-snug line-clamp-2 mt-1">{c.lastPreview}</p>
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono">
                    {c.assignedAgentName && <span className="text-brand-bright inline-flex items-center gap-0.5"><Bot size={9} /> {c.assignedAgentName}</span>}
                    {c.unreadCount > 0 && <span className="px-1 py-px rounded-full bg-semantic-red/20 text-semantic-red">{c.unreadCount}</span>}
                    <span className="ml-auto text-creme-faint">{new Date(c.lastActivityAt).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
                  </div>
                </button>
              ))}
              {items.length === 0 && <p className="text-[11px] text-creme-faint italic p-3 text-center">vazia</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilterBtn({ active, onClick, label, count, alert }: { active: boolean; onClick: () => void; label: string; count: number; alert?: boolean }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold transition-colors', active ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:text-creme hover:bg-surface-hover')}>
      {label}
      <span className={clsx('text-[10px] font-mono px-1 rounded-full', alert && count > 0 ? 'bg-semantic-red/20 text-semantic-red' : active ? 'bg-brand/20' : 'bg-surface-3 text-creme-faint')}>
        {count}
      </span>
    </button>
  );
}

function ConversationRow({ conversation: c, selected, onClick }: { conversation: InboxConversation; selected: boolean; onClick: () => void }) {
  const PrimaryIcon = CHANNEL_ICON[c.primaryChannel];
  return (
    <button onClick={onClick} className={clsx('w-full text-left p-3 border-b border-default transition-all', selected ? 'bg-brand/10' : 'hover:bg-surface-hover/30')}>
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-surface-3 border border-default flex items-center justify-center text-[12px] font-bold text-creme-mute">
            {c.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
          </div>
          <PrimaryIcon size={11} className={clsx('absolute -bottom-0.5 -right-0.5 bg-surface-2 rounded-full p-0.5', CHANNEL_COLOR[c.primaryChannel])} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={clsx('text-[12.5px] font-semibold truncate', selected ? 'text-brand-bright' : 'text-creme')}>{c.customerName}</span>
            <span className="text-[10.5px] text-creme-faint font-mono shrink-0">{new Date(c.lastActivityAt).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
          </div>
          <p className="text-[11.5px] text-creme-mute truncate mt-0.5 leading-snug">{c.lastPreview}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={clsx('text-[9.5px] font-mono px-1.5 py-px rounded-full', STATUS_META[c.status].color)}>{STATUS_META[c.status].label}</span>
            {c.unreadCount > 0 && <span className="text-[10px] font-mono px-1.5 py-px rounded-full bg-semantic-red/20 text-semantic-red font-bold">{c.unreadCount}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}
