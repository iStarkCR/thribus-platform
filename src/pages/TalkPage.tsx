import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Send, Bot, Crown, Loader2, Plus, FolderPlus, Folder, ChevronDown, ChevronRight, Trash2, MessageSquare,
  Users, Check, Settings2,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { listMessages, sendMessage, subscribeChat, chatConfigured, type ChatMessage } from '@/services/collaboratorChat';
import {
  listFolders, createFolder, deleteFolder, listSessions, createSession, renameSession, deleteSession, touchSession,
  type ChatFolder, type ChatSession,
} from '@/services/chatSessions';
import { PromptDialog, ConfirmDialog } from '@/components/shared/Dialogs';
import { AgentInfoModal } from '@/components/agents/AgentInfoModal';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';

const BUKOWISKI_ID = 'bukowiski-thribus';

/**
 * Chat com colaborador (estilo Claude): agente único no topo, lateral com
 * pastas + sessões, botão "Nova sessão". Mensagem entra 'pending'; o daemon
 * do Claude Code responde via realtime.
 */
export function TalkPage() {
  const agents = useAppStore((s) => s.agents);
  const { user } = useSession();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const agentParam = searchParams.get('agent');

  // Agente único — da URL (?agent=) ou Bukowiski por padrão.
  const agent = useMemo(() => {
    if (agentParam) return agents.find((a) => a.id === agentParam) ?? null;
    return agents.find((a) => a.id === BUKOWISKI_ID) ?? agents[0] ?? null;
  }, [agents, agentParam]);
  const agentId = agent?.id ?? null;

  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [folderDialog, setFolderDialog] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Colaboradores pra trocar (Bukowiski no topo).
  const collaborators = useMemo(
    () => [...agents].sort((a, b) => (a.id === BUKOWISKI_ID ? -1 : b.id === BUKOWISKI_ID ? 1 : a.name.localeCompare(b.name))),
    [agents],
  );

  // Carrega pastas + sessões do agente.
  const loadTree = useCallback(async () => {
    if (!agentId || !userId) return;
    const [f, s] = await Promise.all([listFolders(agentId, userId), listSessions(agentId, userId)]);
    setFolders(f);
    setSessions(s);
    setActiveId((cur) => cur ?? s[0]?.id ?? null);
  }, [agentId, userId]);

  useEffect(() => {
    setSessions([]);
    setFolders([]);
    setActiveId(null);
    setMessages([]);
    loadTree();
  }, [loadTree]);

  // Mensagens da sessão ativa.
  const refetch = useCallback(async () => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await listMessages(activeId));
    } catch {
      /* silencioso */
    }
  }, [activeId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: resposta do daemon aparece sozinha.
  useEffect(() => {
    if (!userId) return;
    return subscribeChat(userId, refetch);
  }, [userId, refetch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const waiting =
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user' &&
    ['pending', 'processing'].includes(messages[messages.length - 1].status);

  // Agrupa sessões por pasta.
  const ungrouped = sessions.filter((s) => !s.folderId);
  const byFolder = (fid: string) => sessions.filter((s) => s.folderId === fid);

  async function newSession(folderId: string | null = null) {
    if (!agentId || !userId) return;
    const s = await createSession(agentId, userId, { folderId });
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
  }

  async function createFolderNamed(name: string) {
    if (!agentId || !userId) return;
    setFolderDialog(false);
    const f = await createFolder(agentId, userId, name);
    setFolders((prev) => [...prev, f]);
  }

  function removeSession(id: string) {
    setConfirm({
      title: 'Apagar conversa',
      message: 'Esta conversa e todas as mensagens dela serão apagadas. Não dá pra desfazer.',
      onConfirm: async () => {
        setConfirm(null);
        await deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeId === id) setActiveId(null);
      },
    });
  }

  function removeFolder(f: ChatFolder) {
    setConfirm({
      title: 'Apagar pasta',
      message: `A pasta "${f.name}" será apagada. As conversas dentro dela voltam para "Sem pasta".`,
      onConfirm: async () => {
        setConfirm(null);
        await deleteFolder(f.id);
        setFolders((prev) => prev.filter((x) => x.id !== f.id));
        setSessions((prev) => prev.map((s) => (s.folderId === f.id ? { ...s, folderId: null } : s)));
      },
    });
  }

  function toggle(fid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !agent || !userId || sending) return;
    setSending(true);
    setInput('');

    let sessionId = activeId;
    let isFirst = false;
    if (!sessionId) {
      const s = await createSession(agent.id, userId, {});
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      sessionId = s.id;
      isFirst = true;
    } else {
      isFirst = messages.length === 0;
    }

    setMessages((m) => [
      ...m,
      { id: `tmp-${m.length}`, sessionId, agentId: agent.id, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, createdAt: '' },
    ]);

    try {
      await sendMessage(sessionId, agent.id, userId, text);
      await touchSession(sessionId);
      // auto-título na primeira mensagem
      if (isFirst) {
        const title = text.slice(0, 40);
        await renameSession(sessionId, title);
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
      }
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
  if (!agent) {
    return <div className="p-6 text-creme-faint text-[13px]">Colaborador não encontrado.</div>;
  }

  return (
    <div className="-m-6 h-screen grid grid-cols-[300px_1fr] overflow-hidden">
      {/* Sessões + pastas */}
      <div className="border-r border-default flex flex-col bg-surface-1 min-h-0">
        <div className="p-3.5 border-b border-default space-y-2.5">
          <button
            onClick={() => newSession(null)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand text-white text-[14px] font-semibold hover:bg-brand-bright transition-colors shadow-sm"
          >
            <Plus size={16} /> Nova sessão
          </button>
          <button
            onClick={() => setFolderDialog(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-default text-creme-mute text-[13px] hover:bg-surface-hover transition-colors"
          >
            <FolderPlus size={14} /> Nova pasta
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {folders.map((f) => {
            const open = !collapsed.has(f.id);
            const list = byFolder(f.id);
            return (
              <div key={f.id}>
                <div className="group flex items-center gap-1 px-1.5 py-1.5 rounded-md hover:bg-surface-hover">
                  <button onClick={() => toggle(f.id)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                    {open ? <ChevronDown size={13} className="text-creme-faint shrink-0" /> : <ChevronRight size={13} className="text-creme-faint shrink-0" />}
                    <Folder size={13} className="text-creme-faint shrink-0" />
                    <span className="text-[12.5px] font-semibold text-creme-dim truncate">{f.name}</span>
                    <span className="text-[10.5px] text-creme-faint">{list.length}</span>
                  </button>
                  <button onClick={() => newSession(f.id)} title="Nova sessão na pasta" className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-brand p-0.5">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => removeFolder(f)} title="Apagar pasta" className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-semantic-red p-0.5">
                    <Trash2 size={11} />
                  </button>
                </div>
                {open && (
                  <div className="ml-3 pl-2 border-l border-default/60 space-y-0.5">
                    {list.map((s) => (
                      <SessionItem key={s.id} session={s} active={s.id === activeId} onClick={() => setActiveId(s.id)} onDelete={() => removeSession(s.id)} />
                    ))}
                    {list.length === 0 && <div className="px-2 py-1 text-[11px] text-creme-faint italic">vazia</div>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sessões sem pasta */}
          {ungrouped.length > 0 && (
            <div className="pt-1">
              {folders.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">Sem pasta</div>
              )}
              <div className="space-y-0.5">
                {ungrouped.map((s) => (
                  <SessionItem key={s.id} session={s} active={s.id === activeId} onClick={() => setActiveId(s.id)} onDelete={() => removeSession(s.id)} />
                ))}
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <div className="px-2 py-6 text-center text-[12px] text-creme-faint">
              Nenhuma sessão ainda.<br />Crie uma em "Nova sessão".
            </div>
          )}
        </div>

        {/* Config & docs do colaborador */}
        <div className="p-2.5 border-t border-default shrink-0">
          <button
            onClick={() => setInfoOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-default flex items-center justify-center text-creme-mute shrink-0">
              <Settings2 size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-creme-dim truncate">Config & docs</div>
              <div className="text-[11px] text-creme-faint truncate">Skills e documentação de {agent.name}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-col bg-surface-0 min-w-0 min-h-0">
        <div className="h-16 px-6 flex items-center justify-between gap-3 border-b border-default shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[15px] font-bold text-white shrink-0">
              {agent.name[0]}
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold tracking-tight text-creme flex items-center gap-2">
                {agent.name}
                {agent.isSupervisor && <Crown size={15} className="text-semantic-amber" />}
              </div>
              <div className="text-[12.5px] text-creme-faint truncate">
                {agent.sector} · {agent.status}{active ? ` · ${active.title}` : ''}
              </div>
            </div>
          </div>

          {/* Trocar colaborador */}
          <div className="relative shrink-0">
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-2 border border-default text-[13px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            >
              <Users size={15} /> Colaboradores <ChevronDown size={13} className="opacity-60" />
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute right-0 mt-1 w-64 max-h-[60vh] overflow-y-auto bg-surface-1 border border-default rounded-xl shadow-2xl z-[56] py-1">
                  {collaborators.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSwitcherOpen(false); navigate(`/talk?agent=${c.id}`); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${c.id === agent.id ? 'bg-brand/10' : 'hover:bg-surface-hover'}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[11px] font-bold text-white shrink-0">{c.name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-creme flex items-center gap-1 truncate">{c.name}{c.isSupervisor && <Crown size={10} className="text-semantic-amber" />}</div>
                        <div className="text-[10.5px] text-creme-faint truncate">{c.sector}</div>
                      </div>
                      {c.id === agent.id && <Check size={13} className="text-brand shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!active && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-creme-faint text-[14px] gap-3">
              <Bot size={34} className="opacity-40" />
              <span>Comece uma sessão com <b className="text-creme-mute">{agent.name}</b>.</span>
              <button onClick={() => newSession(null)} className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors">
                <Plus size={15} /> Nova sessão
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-creme-faint text-[14px] gap-3">
              <MessageSquare size={32} className="opacity-40" />
              <span>Mande a primeira mensagem.</span>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-brand text-white rounded-br-md' : 'bg-surface-2 text-creme border border-default rounded-bl-md'
                  }`}
                >
                  {m.content}
                  {m.status === 'error' && <div className="text-[11px] mt-1 text-semantic-red">erro: {m.error}</div>}
                </div>
              </div>
            ))
          )}
          {waiting && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-surface-2 border border-default text-creme-mute text-[14px] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> {agent.name} está pensando…
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-default shrink-0">
          <div className="flex items-end gap-2.5 bg-surface-2 border border-default rounded-2xl px-3 py-2 focus-within:border-brand transition-colors">
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
              placeholder={`Mensagem para ${agent.name}…`}
              className="flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[14.5px] text-creme placeholder-creme-faint focus:outline-none max-h-40"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors"
            >
              {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>

      {folderDialog && (
        <PromptDialog
          title="Nova pasta"
          label="Nome da pasta"
          placeholder="Ex: Estratégia, Financeiro…"
          onConfirm={createFolderNamed}
          onClose={() => setFolderDialog(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Apagar"
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
      {infoOpen && <AgentInfoModal agent={agent} onClose={() => setInfoOpen(false)} onEdit={() => setEditOpen(true)} />}
      {editOpen && <AgentDetailModal agent={agent} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function SessionItem({ session, active, onClick, onDelete }: { session: ChatSession; active: boolean; onClick: () => void; onDelete: () => void }) {
  return (
    <div className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${active ? 'bg-brand/10' : 'hover:bg-surface-hover'}`} onClick={onClick}>
      <MessageSquare size={13} className="text-creme-faint shrink-0" />
      <span className={`flex-1 min-w-0 text-[13.5px] truncate ${active ? 'text-creme font-medium' : 'text-creme-mute'}`}>{session.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-semantic-red p-0.5 shrink-0"
        title="Apagar conversa"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
