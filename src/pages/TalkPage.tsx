import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Search, Bot, Crown, Loader2 } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import {
  listMessages, sendMessage, subscribeChat, chatConfigured, type ChatMessage,
} from '@/services/collaboratorChat';

const BUKOWISKI_ID = 'bukowiski-thribus';

/**
 * Conversas — chat direto com colaboradores (Bukowiski etc.).
 * Mensagem entra como 'pending'; o daemon do Claude Code responde via realtime.
 */
export function TalkPage() {
  const agents = useAppStore((s) => s.agents);
  const { user } = useSession();
  const userId = user?.id ?? null;

  const collaborators = useMemo(() => {
    const sorted = [...agents].sort((a, b) => {
      if (a.id === BUKOWISKI_ID) return -1;
      if (b.id === BUKOWISKI_ID) return 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [agents]);

  const [searchParams] = useSearchParams();
  const agentParam = searchParams.get('agent');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Seleção inicial: colaborador da URL (?agent=) > Bukowiski > primeiro.
  useEffect(() => {
    if (collaborators.length === 0) return;
    if (agentParam && collaborators.some((c) => c.id === agentParam)) {
      setSelectedId(agentParam);
    } else if (!selectedId) {
      setSelectedId(collaborators.find((c) => c.id === BUKOWISKI_ID)?.id ?? collaborators[0].id);
    }
  }, [collaborators, agentParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useMemo(
    () => async () => {
      if (!selectedId || !userId) return;
      try {
        setMessages(await listMessages(selectedId, userId));
      } catch {
        /* silencioso */
      }
    },
    [selectedId, userId],
  );

  useEffect(() => {
    setMessages([]);
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeChat(userId, refetch);
    return unsub;
  }, [userId, refetch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const selected = collaborators.find((c) => c.id === selectedId) ?? null;
  const filtered = collaborators.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const waiting = messages.length > 0 && messages[messages.length - 1].role === 'user'
    && ['pending', 'processing'].includes(messages[messages.length - 1].status);

  async function handleSend() {
    const text = input.trim();
    if (!text || !selected || !userId || sending) return;
    setSending(true);
    setInput('');
    // otimista
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, agentId: selected.id, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, createdAt: new Date().toISOString() },
    ]);
    try {
      await sendMessage(selected.id, userId, text);
      await refetch();
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
      setInput(text);
      alert('Falha ao enviar: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!chatConfigured) {
    return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado — defina <code className="font-mono text-creme">.env.local</code>.</div>;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] grid grid-cols-[280px_1fr]">
      {/* Lista de colaboradores */}
      <div className="border-r border-default flex flex-col bg-surface-1">
        <div className="p-3 border-b border-default">
          <h1 className="text-[15px] font-bold text-creme mb-2">Conversas</h1>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar colaborador…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-default/40 text-left transition-colors ${
                selectedId === c.id ? 'bg-brand/10' : 'hover:bg-surface-hover'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-medium text-creme truncate">{c.name}</span>
                  {c.id === BUKOWISKI_ID && <Crown size={11} className="text-semantic-amber shrink-0" />}
                </div>
                <div className="text-[10.5px] text-creme-faint truncate">{c.sector}</div>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'online' ? 'bg-semantic-green' : 'bg-creme-faint'}`} />
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-4 text-[12px] text-creme-faint">Nenhum colaborador.</div>}
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-col bg-surface-0 min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-creme-faint text-[13px]">Selecione um colaborador.</div>
        ) : (
          <>
            <div className="h-14 px-4 flex items-center gap-2.5 border-b border-default shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[12px] font-bold text-white">
                {selected.name[0]}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-creme flex items-center gap-1">
                  {selected.name}
                  {selected.id === BUKOWISKI_ID && <Crown size={12} className="text-semantic-amber" />}
                </div>
                <div className="text-[11px] text-creme-faint">{selected.sector} · {selected.status}</div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-creme-faint text-[12.5px] gap-2">
                  <Bot size={28} className="opacity-40" />
                  <span>Comece a conversa com {selected.name}.</span>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[72%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-brand text-white rounded-br-sm'
                        : 'bg-surface-2 text-creme border border-default rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                    {m.status === 'error' && <div className="text-[10.5px] mt-1 text-semantic-red">erro: {m.error}</div>}
                  </div>
                </div>
              ))}
              {waiting && (
                <div className="flex justify-start">
                  <div className="px-3.5 py-2 rounded-2xl rounded-bl-sm bg-surface-2 border border-default text-creme-mute text-[12.5px] flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> {selected.name} está pensando…
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-default shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder={`Mensagem para ${selected.name}…`}
                  className="flex-1 resize-none px-3 py-2 rounded-xl bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand max-h-32"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
