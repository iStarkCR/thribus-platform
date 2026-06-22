import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Send, Crown, Loader2, Plus, FolderPlus, Folder, ChevronDown, ChevronRight, Trash2, MessageSquare,
  Users, Check, Settings2, Mic, MicOff, Volume2, VolumeX, Pencil, Palette, FolderPlus as SubfolderIcon, Headphones, AudioLines, X, Cog, Paperclip, Square, Copy, RefreshCw, ArrowRight,
  ListChecks, Lightbulb, Clock, BarChart3, MoreVertical, Archive, Pin, History, Sparkles, Search,
  PanelLeftClose, PanelLeft, GitBranch, Activity, AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { isStopPhrase, isNoise, mapVoiceState, ORB_FOLDER_NAME, type VoiceState } from '@/hooks/useOrbConversation';
import { VoiceController, type VoiceTurn } from '@/lib/voiceMode';
import { AudioRecorderBar } from '@/components/voice/AudioRecorderBar';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { CortexBrainBar } from '@/components/cortex/CortexBrainBar';
import { CortexUsageBadge } from '@/components/cortex/CortexUsageBadge';
import { Markdown } from '@/components/shared/Markdown';
import { ThinkingActivity, MessageSteps, type StepAction } from '@/components/shared/ThinkingActivity';
import { type RunEvent } from '@/services/runEvents';
import { listMessages, sendMessage, cancelMessage, subscribeChat, chatConfigured, uploadAttachment, improvePrompt, type ChatMessage, type Attachment } from '@/services/collaboratorChat';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { createDemand, listDemands } from '@/services/demands';
import { listStatusComponents, platformConfigured } from '@/services/platform';
import { RoutineModal } from '@/components/routines/RoutineModal';
import { SessionUsageModal } from '@/components/chat/SessionUsageModal';
import { SessionContextMenu } from '@/components/chat/SessionContextMenu';
import { TranscriptModal } from '@/components/chat/TranscriptModal';
import {
  listFolders, createFolder, updateFolder, deleteFolder, listSessions, createSession, renameSession, deleteSession, touchSession, moveSession, setSessionArchived, setSessionColor, setSessionPinned, forkSession,
  type ChatFolder, type ChatSession,
} from '@/services/chatSessions';

const FOLDER_COLORS = ['#6B8F5E', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#14b8a6', '#ec4899', '#64748b'];
import { AgentInfoModal } from '@/components/agents/AgentInfoModal';
import { AgentDetailModal } from '@/components/agents/AgentDetailModal';
import { getVoiceConfig, ttsBlob, transcribeBlob, quickAck, greetLine, type VoiceConfig } from '@/services/voiceSkill';

const BUKOWISKI_ID = 'bukowiski-thribus';

/**
 * Chat com colaborador (estilo Claude): agente único no topo, lateral com
 * pastas + sessões, botão "Nova sessão". Mensagem entra 'pending'; o daemon
 * do Claude Code responde via realtime.
 */
export function TalkPage() {
  const agents = useAppStore((s) => s.agents);
  const metrics = useAppStore((s) => s.metrics);
  const escalations = useAppStore((s) => s.escalations);
  const setVoiceModeActive = useAppStore((s) => s.setVoiceModeActive);
  const setSttBusy = useAppStore((s) => s.setSttBusy);
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
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Tela atual: 'orb' (boas-vindas) é SEMPRE a inicial; só vai pra 'chat' por ação
  // explícita (abrir uma conversa, retomar, enviar). Entrar nunca cai direto no chat.
  const [view, setView] = useState<'orb' | 'chat'>('orb');
  const [histOpen, setHistOpen] = useState(false);
  const [sidebarQuery, setSidebarQuery] = useState(''); // busca de conversas na lateral
  // Uma vez que o usuário ENTRA num chat, navegar entre chats fica direto (não volta
  // pro orbe). Só recarregar/trocar de colaborador volta pro orbe. Default: false.
  const [chatMode, setChatMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [cmdIdx, setCmdIdx] = useState(0); // item selecionado no menu de comandos "/"
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  // Recolher a sidebar de conversas (persistido).
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('thribus.chatNav') === '0'; } catch { return false; }
  });
  const toggleNav = () => setNavCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem('thribus.chatNav', next ? '0' : '1'); } catch { /* noop */ }
    return next;
  });
  // Mensagens longas do usuário colapsadas (id → expandida).
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedMsgs((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null); // pasta com menu (engrenagem) aberto
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [sessMenu, setSessMenu] = useState<{ id: string; x: number; y: number } | null>(null); // menu (…) de uma conversa
  const [showArchived, setShowArchived] = useState(false);
  const [transcriptFor, setTranscriptFor] = useState<ChatSession | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // folder id ou 'root'
  const dragItemRef = useRef<{ type: 'session' | 'folder'; id: string } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Colaboradores pra trocar (Bukowiski no topo).
  const collaborators = useMemo(
    () => [...agents].sort((a, b) => (a.id === BUKOWISKI_ID ? -1 : b.id === BUKOWISKI_ID ? 1 : a.name.localeCompare(b.name))),
    [agents],
  );

  // Voz (STT/TTS no navegador) + saudação tipo CORTEX.
  const voice = useVoice();
  const [ttsOn, setTtsOn] = useState(false);
  const rawName = ((user?.user_metadata?.name as string | undefined) ?? user?.email?.split('@')[0] ?? 'Charles').split(' ')[0];
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  // Hora de BRASÍLIA (America/Sao_Paulo), não a do navegador.
  const brasiliaHour = useMemo(() => {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date());
    return parseInt(s, 10) % 24; // % 24: alguns engines retornam "24" à meia-noite (hourCycle h24) → vira 0
  }, []);
  const greeting = brasiliaHour < 12 ? 'Bom dia' : brasiliaHour < 18 ? 'Boa tarde' : 'Boa noite';
  const period = brasiliaHour < 12 ? 'manhã' : brasiliaHour < 18 ? 'tarde' : 'noite';
  // Linha de saudação gerada por modelo leve (gpt-4o-mini) — natural + relembra
  // a última coisa feita se houver conversa anterior. null até decidir o texto.
  const [dynGreet, setDynGreet] = useState<string | null>(null);
  // Saudação por CONTEXTO: cache keyed por conversa primada (activeId) ou '__landing__'.
  const greetCacheRef = useRef<Record<string, string>>({});
  const spokenRef = useRef<string | null>(null);

  // ─── Skill de Voz ───────────────────────────────────────────────────────────
  const [voiceCfg, setVoiceCfg] = useState<VoiceConfig | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false); // gravador de áudio (transcrição)
  const [speakingProvider, setSpeakingProvider] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceModeRef = useRef(false);
  const wasListeningRef = useRef(false);
  const waitingRef = useRef(false); // já há mensagem do usuário aguardando resposta
  const voiceCfgRef = useRef<VoiceConfig | null>(null);
  // Motor de voz do PAINEL (VoiceController) — atrelado à sessão ATIVA: a fala vira
  // mensagem (is_voice) NESTA conversa, e a resposta é falada. Separado do orbe.
  const [panelVoiceState, setPanelVoiceState] = useState<VoiceState>('idle');
  const [panelMuted, setPanelMuted] = useState(false); // mic pausado no modo voz
  const [panelLevel, setPanelLevel] = useState(0); // energia do mic (esfera reativa)
  const [panelPlayLevel, setPanelPlayLevel] = useState(0); // energia do TTS tocando
  const playLevelRef = useRef(0);
  const lastPlayAtRef = useRef(0);
  const [panelTurns, setPanelTurns] = useState<VoiceTurn[]>([]); // fila de falas
  const [expandedTurn, setExpandedTurn] = useState<string | null>(null); // item aberto na fila
  const [editingTurn, setEditingTurn] = useState<string | null>(null); // item em edição
  const [editTurnText, setEditTurnText] = useState('');
  const panelVoiceRef = useRef<VoiceController | null>(null);
  const levelRef = useRef(0);
  const lastLevelAtRef = useRef(0);
  const pendingReplyRef = useRef<((s: string) => void) | null>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  // Quando a transcrição (push-to-talk) termina e não está no modo voz, libera o
  // wake word (sttBusy=false). Só dispara na transição ouvindo→parou, não no início.
  useEffect(() => {
    if (voice.listening) wasListeningRef.current = true;
    else if (wasListeningRef.current && !voiceMode) { wasListeningRef.current = false; setSttBusy(false); }
  }, [voice.listening, voiceMode, setSttBusy]);
  useEffect(() => { voiceCfgRef.current = voiceCfg; }, [voiceCfg]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // ─── Modo voz do painel (VoiceController na sessão ativa) ────────────────────
  // Manda o texto falado p/ a conversa ATIVA (is_voice) e resolve com a resposta
  // do daemon via realtime. Cria sessão se não houver nenhuma aberta.
  const panelSendAndAwait = useCallback(async (text: string): Promise<string> => {
    if (!agent || !userId) return '';
    let sid = activeIdRef.current;
    if (!sid) {
      const s = await createSession(agent.id, userId, {}).catch(() => null);
      if (!s) return '';
      sid = s.id;
      activeIdRef.current = sid;
      setActiveId(sid);
      setView('chat'); setChatMode(true);
      setSessions((prev) => [s, ...prev]);
    }
    try {
      await sendMessage(sid, agent.id, userId, text, undefined, true);
      await touchSession(sid);
    } catch (e) {
      useAppStore.getState().addToast('Falha ao enviar: ' + (e as Error).message, 'red');
      return '';
    }
    return await new Promise<string>((resolve) => {
      pendingReplyRef.current = resolve;
      setTimeout(() => { if (pendingReplyRef.current === resolve) { pendingReplyRef.current = null; resolve(''); } }, 240000);
    });
  }, [agent, userId]);

  function togglePanelMute() {
    const next = !panelMuted;
    setPanelMuted(next);
    panelVoiceRef.current?.setMuted(next);
  }

  function startPanelVoice() {
    if (panelVoiceRef.current || !agent) return;
    setVoiceMode(true); voiceModeRef.current = true; setVoiceModeActive(true); setPanelMuted(false);
    const aid = agent.id;
    const ctrl = new VoiceController({
      transcribe: async (b) => (await transcribeBlob(aid, b)) ?? '',
      tts: (t) => ttsBlob(aid, t),
      sendAndAwait: panelSendAndAwait,
      quickAck: (t) => quickAck(aid, t),
      isNoise,
      onState: (s) => setPanelVoiceState(mapVoiceState(s)),
      onLevel: (rms) => {
        // Esfera reativa à voz (estilo CORTEX): suaviza e atualiza throttled (~12fps).
        const norm = Math.min(1, rms / 0.25);
        levelRef.current = levelRef.current * 0.7 + norm * 0.3;
        const now = performance.now();
        if (now - lastLevelAtRef.current > 80) { lastLevelAtRef.current = now; setPanelLevel(levelRef.current); }
      },
      onPlaybackLevel: (rms) => {
        const norm = Math.min(1, rms / 0.18);
        playLevelRef.current = playLevelRef.current * 0.6 + norm * 0.4;
        const now = performance.now();
        if (now - lastPlayAtRef.current > 70) { lastPlayAtRef.current = now; setPanelPlayLevel(playLevelRef.current); }
      },
      onTurns: (turns) => setPanelTurns(turns),
      onTranscript: (t) => { if (isStopPhrase(t)) stopPanelVoice(); },
      onError: (e) => useAppStore.getState().addToast(e.message, 'red'),
    });
    panelVoiceRef.current = ctrl;
    ctrl.start();
  }
  function stopPanelVoice() {
    panelVoiceRef.current?.stop();
    panelVoiceRef.current = null;
    pendingReplyRef.current = null;
    levelRef.current = 0; setPanelLevel(0); playLevelRef.current = 0; setPanelPlayLevel(0); setPanelTurns([]); setEditingTurn(null); setExpandedTurn(null);
    setPanelVoiceState('idle');
    setVoiceMode(false); voiceModeRef.current = false; setVoiceModeActive(false);
  }

  // Resolve a resposta pendente do modo voz quando a msg assistant 'done' chega.
  useEffect(() => {
    if (!pendingReplyRef.current || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.status === 'done') {
      const r = pendingReplyRef.current; pendingReplyRef.current = null; r(last.content);
    }
  }, [messages]);

  // Limpa o flag global de modo voz + para o motor ao sair da página.
  useEffect(() => () => { panelVoiceRef.current?.stop(); panelVoiceRef.current = null; setVoiceModeActive(false); }, [setVoiceModeActive]);

  useEffect(() => {
    if (!agentId) return;
    getVoiceConfig(agentId).then((c) => setVoiceCfg(c)).catch(() => setVoiceCfg(null));
  }, [agentId]);

  // Intensidade pra esfera reagir à voz.
  const sphereIntensity = voice.listening || voice.speaking || speakingProvider ? 0.85 : 0;

  // Carrega pastas + sessões do agente.
  const loadTree = useCallback(async () => {
    if (!agentId || !userId) return;
    const [f, s] = await Promise.all([listFolders(agentId, userId), listSessions(agentId, userId)]);
    // Esconde a pasta do orbe e suas sessões — o orbe tem conversa própria, fora
    // do painel (senão o painel auto-selecionaria a sessão do orbe).
    const orbFolderId = f.find((x) => x.name === ORB_FOLDER_NAME)?.id ?? null;
    const fVisible = orbFolderId ? f.filter((x) => x.id !== orbFolderId) : f;
    const sVisible = orbFolderId ? s.filter((x) => x.folderId !== orbFolderId) : s;
    setFolders(fVisible);
    setSessions(sVisible);
    setTreeLoaded(true);
    // Ao entrar no chat, abre na TELA DE BOAS-VINDAS (não pula pra última conversa);
    // dá pra retomar a última pelo atalho na própria tela.
  }, [agentId, userId]);

  useEffect(() => {
    setSessions([]);
    setFolders([]);
    setActiveId(null);
    setMessages([]);
    setView('orb');
    setHistOpen(false);
    setChatMode(false);
    setTreeLoaded(false);
    greetCacheRef.current = {};
    setDynGreet(null);
    loadTree();
  }, [loadTree]);

  // Mensagens da sessão ativa.
  const refetch = useCallback(async () => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    try {
      const msgs = await listMessages(activeId);
      // Só aplica se a sessão ainda é a ativa (fetch obsoleto não sobrescreve).
      if (activeIdRef.current === activeId) setMessages(msgs);
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

  // Fala uma resposta: provider configurado (áudio) ou voz nativa do navegador.
  async function speakReply(text: string, onEnd?: () => void) {
    // A Edge Function (service role) é a fonte da verdade do provider/voz — o front
    // NÃO lê agent_voice_config (RLS protege a api_key). Então sempre tenta o TTS do
    // provider; ttsBlob devolve null se a função decidir "browser" → aí sim navegador.
    if (agentId) {
      try {
        const blob = await ttsBlob(agentId, text);
        if (blob) {
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          setSpeakingProvider(true);
          const done = () => { setSpeakingProvider(false); onEnd?.(); };
          audio.onended = done;
          audio.onerror = done;
          await audio.play();
          return;
        }
      } catch { /* cai pro navegador */ }
    }
    voice.speak(text, onEnd);
  }

  // TTS: fala a última resposta do assistente (quando ligado ou em modo voz).
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.status === 'done' && last.id !== spokenRef.current) {
      spokenRef.current = last.id;
      // No modo voz o VoiceController já fala a resposta — aqui só o TTS de texto.
      if (ttsOn && !voiceModeRef.current) speakReply(last.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsOn]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  // Só mostra a CONVERSA quando o usuário foi explicitamente pra ela (view='chat'),
  // há sessão ativa E ela tem mensagens. Senão o orbe é a tela — nunca branco/fantasma.
  const inChat = view === 'chat' && activeId != null && messages.length > 0;
  // Pulse/Atenção da tela inicial (dados reais, carregados async ao entrar no orbe).
  const [orbDemands, setOrbDemands] = useState<number | null>(null);
  const [orbSystems, setOrbSystems] = useState<{ ok: number; total: number; issues: { name: string; status: string }[] } | null>(null);
  useEffect(() => {
    if (inChat) return;
    let alive = true;
    (async () => {
      if (userId) {
        try {
          const ds = await listDemands(userId);
          if (alive) setOrbDemands(ds.filter((d) => d.status === 'todo' || d.status === 'doing' || d.status === 'waiting').length);
        } catch { /* silencioso */ }
      }
      if (platformConfigured) {
        try {
          const comps = await listStatusComponents();
          if (alive && comps.length) {
            const issues = comps.filter((c) => c.status !== 'operational').map((c) => ({ name: c.name, status: c.status }));
            setOrbSystems({ ok: comps.length - issues.length, total: comps.length, issues });
          }
        } catch { /* silencioso */ }
      }
    })();
    return () => { alive = false; };
  }, [inChat, userId]);
  const waiting =
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user' &&
    ['pending', 'processing'].includes(messages[messages.length - 1].status);
  waitingRef.current = waiting;
  // mensagem do usuário em processamento → chave dos passos "por trás"
  const lastUserMsgId = waiting ? messages[messages.length - 1].id : null;

  // Aurora reativa — o fundo (tema glass) pulsa quando o Bukowiski pensa e ganha
  // vida quando ele FALA (TTS). Limpa as classes ao desmontar.
  useEffect(() => {
    document.documentElement.classList.toggle('chat-busy', waiting);
  }, [waiting]);
  useEffect(() => {
    const speaking = speakingProvider || voice.speaking || panelPlayLevel > 0.03;
    document.documentElement.classList.toggle('chat-speaking', speaking);
  }, [speakingProvider, voice.speaking, panelPlayLevel]);
  useEffect(() => () => { document.documentElement.classList.remove('chat-busy', 'chat-speaking'); }, []);

  // Saudação dinâmica POR CONTEXTO — só no orbe (não no chat). Relembra a última
  // coisa feita na conversa PRIMADA (activeId) ou, na entrada, na mais recente.
  // Cacheada por conversa → muda quando você navega de chat e não re-chama o modelo.
  useEffect(() => {
    if (inChat || !agentId || !treeLoaded) return;
    const key = activeId ?? '__landing__';
    const cached = greetCacheRef.current[key];
    if (cached) { setDynGreet(cached); return; } // já temos pra esse contexto
    setDynGreet(null);
    let cancelled = false;
    const FALLBACK = `Como vai${period === 'noite' ? ' a noite' : ' hoje'}? O que a gente resolve agora?`;
    const fb = setTimeout(() => { if (!cancelled) setDynGreet((p) => p ?? FALLBACK); }, 6000);
    (async () => {
      // conversa-alvo: a primada (activeId) ou a mais recente (landing).
      const target = activeId ? sessions.find((s) => s.id === activeId) : sessions.find((x) => !x.archivedAt);
      let ctx = '';
      if (target) {
        try {
          const msgs = await listMessages(target.id);
          const lastA = [...msgs].reverse().find((m) => m.role === 'assistant' && m.content.trim());
          if (lastA) ctx = `Conversa "${target.title}". Última coisa feita: ${lastA.content.replace(/\s+/g, ' ').slice(0, 280)}`;
          else if (msgs.length) ctx = `Conversa: "${target.title}".`;
          // sem mensagens → ctx vazio = saudação fresca (começo do zero)
        } catch { ctx = `Conversa: "${target.title}".`; }
      }
      let line = '';
      try { line = await greetLine(agentId, { name: firstName, period, lastContext: ctx }); } catch { /* 429/erro → fallback */ }
      if (cancelled) return;
      clearTimeout(fb);
      const v = line || FALLBACK;
      greetCacheRef.current[key] = v;
      setDynGreet(v);
    })();
    return () => { cancelled = true; clearTimeout(fb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, activeId, inChat, treeLoaded, period, sessions]);

  // Botão "Parar": marca a msg como cancelada (a ponte mata o claude) + UI otimista.
  async function cancelTurn(msgId: string) {
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, status: 'cancelled' } : x)));
    try { await cancelMessage(msgId); }
    catch (e) { useAppStore.getState().addToast('Falha ao parar: ' + (e as Error).message, 'red'); }
  }

  // Agrupa sessões por pasta + hierarquia de pastas (só as ATIVAS — arquivadas
  // ficam numa seção à parte no rodapé). Fixadas (pin) sobem pro topo.
  const liveSessions = sessions
    .filter((s) => !s.archivedAt)
    .sort((a, b) => (a.pinnedAt ? 0 : 1) - (b.pinnedAt ? 0 : 1)); // estável: mantém updated_at desc dentro de cada grupo
  const archivedSessions = sessions.filter((s) => s.archivedAt);
  const ungrouped = liveSessions.filter((s) => !s.folderId);
  const byFolder = (fid: string) => liveSessions.filter((s) => s.folderId === fid);
  // Busca da lateral — resultado flat (todas as sessões, ativas + arquivadas) por título.
  const sq = sidebarQuery.trim().toLowerCase();
  const searchResults = sq ? sessions.filter((s) => s.title.toLowerCase().includes(sq)) : [];
  // Separadores por data (Hoje/Ontem/…) pelas conversas SEM pasta e não-fixadas.
  const dateBucket = (iso: string): string => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const t = new Date(iso).getTime(); const d0 = startToday.getTime(); const day = 86400000;
    if (t >= d0) return 'Hoje';
    if (t >= d0 - day) return 'Ontem';
    if (t >= d0 - 7 * day) return 'Últimos 7 dias';
    if (t >= d0 - 30 * day) return 'Últimos 30 dias';
    return 'Mais antigo';
  };
  const DATE_ORDER = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Mais antigo'];
  const rootFolders = folders.filter((f) => !f.parentId);
  const childFolders = (pid: string) => folders.filter((f) => f.parentId === pid);

  const patchSession = (id: string, patch: Partial<ChatSession>) =>
    setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function toggleArchive(s: ChatSession) {
    try {
      const archivedAt = await setSessionArchived(s.id, !s.archivedAt);
      patchSession(s.id, { archivedAt });
      if (!s.archivedAt && activeId === s.id) { setActiveId(null); setMessages([]); setView('orb'); }
      useAppStore.getState().addToast(s.archivedAt ? 'Conversa desarquivada' : 'Conversa arquivada', 'green');
    } catch (e) {
      useAppStore.getState().addToast('Falha ao arquivar: ' + (e as Error).message, 'red');
    }
  }

  async function togglePin(s: ChatSession) {
    try {
      const pinnedAt = await setSessionPinned(s.id, !s.pinnedAt);
      patchSession(s.id, { pinnedAt });
    } catch (e) {
      useAppStore.getState().addToast('Falha ao fixar: ' + (e as Error).message, 'red');
    }
  }

  async function changeColor(s: ChatSession, color: string | null) {
    try { await setSessionColor(s.id, color); patchSession(s.id, { color }); }
    catch (e) { useAppStore.getState().addToast('Falha ao mudar cor: ' + (e as Error).message, 'red'); }
  }

  async function moveToFolder(s: ChatSession, folderId: string | null) {
    try { await moveSession(s.id, folderId); patchSession(s.id, { folderId }); }
    catch (e) { useAppStore.getState().addToast('Falha ao mover: ' + (e as Error).message, 'red'); }
  }

  async function forkSessionAction(s: ChatSession) {
    if (!userId) return;
    try {
      const copy = await forkSession(s, userId);
      setSessions((prev) => [copy, ...prev]);
      setMessages([]);
      setActiveId(copy.id);
      setView('chat'); setChatMode(true);
      useAppStore.getState().addToast('Conversa duplicada', 'green');
    } catch (e) {
      useAppStore.getState().addToast('Falha ao duplicar: ' + (e as Error).message, 'red');
    }
  }

  // ─── Drag-drop: organizar conversas e pastas ────────────────────────────────
  function isDescendant(folderId: string, ancestorId: string): boolean {
    let cur: ChatFolder | undefined = folders.find((f) => f.id === folderId);
    while (cur) {
      if (cur.parentId === ancestorId) return true;
      cur = folders.find((f) => f.id === cur!.parentId);
    }
    return false;
  }
  async function dropOnTarget(targetFolderId: string | null) {
    const item = dragItemRef.current;
    dragItemRef.current = null;
    setDragOverId(null);
    if (!item) return;
    if (item.type === 'session') {
      await moveSession(item.id, targetFolderId);
      setSessions((prev) => prev.map((s) => (s.id === item.id ? { ...s, folderId: targetFolderId } : s)));
    } else if (item.type === 'folder') {
      if (item.id === targetFolderId) return;
      if (targetFolderId && isDescendant(targetFolderId, item.id)) return; // não aninhar numa subpasta sua
      await updateFolder(item.id, { parentId: targetFolderId });
      setFolders((prev) => prev.map((f) => (f.id === item.id ? { ...f, parentId: targetFolderId } : f)));
    }
  }

  // Selecionar uma conversa: no orbe (landing) prima e mostra "Abrir conversa";
  // já em chatMode vai DIRETO pro chat (navegar entre chats não volta pro orbe).
  function selectConversation(id: string) {
    if (chatMode) { void enterConversation(id); return; } // já no chat → entra direto (pré-carrega, sem flash)
    setActiveId(id);
    setMessages([]); // landing: orbe não mostra msgs, então limpa
    setHistOpen(false);
    setView('orb');
  }
  // Entrar de fato no chat (Abrir conversa / retomar última): pré-carrega e vai pro chat.
  async function enterConversation(id: string) {
    activeIdRef.current = id; // síncrono → guard confiável contra cliques rápidos
    setActiveId(id);
    setHistOpen(false);
    setChatMode(true);
    try { const msgs = await listMessages(id); if (activeIdRef.current === id) setMessages(msgs); } catch { /* refetch cobre */ }
    setView('chat');
  }

  async function newSession(folderId: string | null = null) {
    if (!agentId || !userId) return;
    const s = await createSession(agentId, userId, { folderId });
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
    // Sessão zerada → tela do orbe (saudação fresca sai sozinha: sessão sem mensagens).
    setView('orb');
    setHistOpen(false);
    setChatMode(false);
  }

  async function newFolder(parentId: string | null = null) {
    if (!agentId || !userId) return;
    const name = (await useAppStore.getState().askPrompt({ title: parentId ? 'Nova subpasta' : 'Nova pasta', label: 'Nome', placeholder: 'Ex: Estratégia' }))?.trim();
    if (!name) return;
    const f = await createFolder(agentId, userId, name, { parentId });
    setFolders((prev) => [...prev, f]);
    if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
  }

  async function renameFolderAction(f: ChatFolder) {
    const name = (await useAppStore.getState().askPrompt({ title: 'Renomear pasta', label: 'Nome', initial: f.name }))?.trim();
    if (!name) return;
    await updateFolder(f.id, { name });
    setFolders((prev) => prev.map((x) => (x.id === f.id ? { ...x, name } : x)));
  }

  async function setFolderColor(f: ChatFolder, color: string | null) {
    await updateFolder(f.id, { color });
    setFolders((prev) => prev.map((x) => (x.id === f.id ? { ...x, color } : x)));
  }

  async function renameSessionAction(s: ChatSession) {
    const title = (await useAppStore.getState().askPrompt({ title: 'Renomear conversa', label: 'Título', initial: s.title }))?.trim();
    if (!title) return;
    await renameSession(s.id, title);
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title } : x)));
  }

  async function removeSession(id: string) {
    const ok = await useAppStore.getState().askConfirm({ title: 'Apagar conversa', message: 'Esta conversa e todas as mensagens dela serão apagadas. Não dá pra desfazer.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); setView('orb'); }
  }

  async function removeFolder(f: ChatFolder) {
    const ok = await useAppStore.getState().askConfirm({ title: 'Apagar pasta', message: `A pasta "${f.name}" (e subpastas) será apagada. As conversas voltam para "Sem pasta".`, confirmLabel: 'Apagar' });
    if (!ok) return;
    await deleteFolder(f.id);
    await loadTree();
  }

  function toggle(fid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
  }

  async function addFiles(files: File[]) {
    if (!userId || !files.length) return;
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const att = await uploadAttachment(userId, activeId, file);
        setAttachments((prev) => [...prev, att]);
      } catch (e) {
        useAppStore.getState().addToast('Falha no anexo: ' + (e as Error).message, 'red');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  // Vira o texto digitado numa DEMANDA (fila async), opcionalmente delegada a outro agente.
  // Ações por mensagem (hover): copiar, ouvir, refazer, virar demanda.
  function copyMsg(text: string) { navigator.clipboard.writeText(text); useAppStore.getState().addToast('Copiado', 'green'); }
  async function improveMyPrompt(m: ChatMessage) {
    if (!agent || !m.content.trim() || improvingId) return;
    setImprovingId(m.id);
    try {
      const improved = await improvePrompt(agent.id, m.content);
      if (improved && improved !== m.content) {
        setInput(improved);
        useAppStore.getState().addToast('Prompt melhorado no campo — revise e reenvie', 'green');
      } else {
        useAppStore.getState().addToast('Sem mudanças sugeridas', 'amber');
      }
    } catch (e) {
      useAppStore.getState().addToast('Melhorar prompt indisponível: ' + (e as Error).message, 'red');
    } finally {
      setImprovingId(null);
    }
  }
  function regenerate(mi: number) { const u = [...messages.slice(0, mi)].reverse().find((x) => x.role === 'user'); if (u) send(u.content); }
  async function msgToDemand(text: string) {
    if (!userId || !agent) return;
    try {
      await createDemand(userId, { title: text.slice(0, 100), description: text.length > 100 ? text : undefined, agentId: agent.id });
      useAppStore.getState().addToast('Jogado nas Demandas', 'green');
    } catch (e) { useAppStore.getState().addToast('Falha: ' + (e as Error).message, 'red'); }
  }

  // Ações a partir do resultado de um passo (modal): manda pro chat / demandas / hub.
  function handleStepAct(action: StepAction, ev: RunEvent) {
    const body = (ev.result ?? ev.input ?? '').trim();
    if (!body) return;
    if (action === 'demand') { msgToDemand(body); return; }
    const prompts: Record<Exclude<StepAction, 'demand'>, string> = {
      explica: `Sobre este resultado de um passo que você executou:\n\n${body}\n\nExplica isso pra mim em PT-BR, claro e direto.`,
      edai: `Sobre este resultado:\n\n${body}\n\nE daí? O que isso significa na prática e o que eu faço agora?`,
      resume: `Resume em até 4 bullets:\n\n${body}`,
      hub: `Publica este conteúdo como relatório no Hub Thribus (hub.thribustech.com) e me devolve o link de compartilhamento:\n\n${body}`,
    };
    send(prompts[action]);
  }

  async function toDemand(targetAgentId: string) {
    const text = input.trim();
    if (!text || !userId) return;
    const name = collaborators.find((c) => c.id === targetAgentId)?.name ?? 'colaborador';
    setPlusOpen(false); setDelegateOpen(false);
    try {
      await createDemand(userId, { title: text.slice(0, 100), description: text.length > 100 ? text : undefined, agentId: targetAgentId });
      setInput('');
      useAppStore.getState().addToast(`Jogado nas Demandas — ${name} vai executar`, 'green');
    } catch (e) {
      useAppStore.getState().addToast('Falha ao criar demanda: ' + (e as Error).message, 'red');
    }
  }

  async function send(textArg?: string) {
    const raw = (textArg ?? input).trim();
    const text = planMode && raw
      ? `${raw}\n\n[MODO PLANO: liste os passos que você faria pra isso e PARE — não execute ainda, espere meu OK.]`
      : raw;
    const atts = attachments;
    if ((!raw && atts.length === 0) || !agent || !userId || sending || uploading > 0) return;
    setSending(true);
    setHistOpen(false);
    if (textArg === undefined) { setInput(''); setAttachments([]); }

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
      { id: `tmp-${m.length}`, sessionId, agentId: agent.id, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, attachments: atts, createdAt: '' },
    ]);
    setView('chat'); setChatMode(true); // só vai pro chat com sessão + mensagem já no ar (sem flash)

    try {
      await sendMessage(sessionId, agent.id, userId, text, atts);
      await touchSession(sessionId);
      // auto-título na primeira mensagem
      if (isFirst) {
        const title = (text || atts[0]?.name || 'Anexo').slice(0, 40);
        await renameSession(sessionId, title);
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
      }
      await refetch();
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
      setInput(text);
      setAttachments(atts);
      useAppStore.getState().addToast('Falha ao enviar: ' + (e as Error).message, 'red');
    } finally {
      setSending(false);
    }
  }

  // Render recursivo de pasta → subpastas → sessões.
  const renderFolder = (f: ChatFolder, depth: number) => {
    const open = !collapsed.has(f.id);
    const sess = byFolder(f.id);
    const subs = childFolders(f.id);
    const dot = f.color ?? '#64748b';
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => { dragItemRef.current = { type: 'folder', id: f.id }; e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(f.id); }}
          onDragLeave={() => setDragOverId((c) => (c === f.id ? null : c))}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnTarget(f.id); }}
          className={`group flex items-center gap-1.5 pr-1 py-2.5 rounded-lg transition-colors ${dragOverId === f.id ? 'bg-brand/15 ring-1 ring-brand/40' : 'hover:bg-surface-hover'}`}
          style={{ paddingLeft: depth * 14 + 8 }}
        >
          <button onClick={() => toggle(f.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {open ? <ChevronDown size={17} className="text-creme-faint shrink-0" /> : <ChevronRight size={17} className="text-creme-faint shrink-0" />}
            <Folder size={17} className="shrink-0" style={{ color: dot }} />
            <span className="text-[15.5px] font-semibold text-creme-dim truncate" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
            <span className="text-[12px] text-creme-faint">{sess.length + subs.length}</span>
          </button>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
            <button onClick={() => newFolder(f.id)} title="Criar pasta" className="text-creme-faint hover:text-brand p-1"><SubfolderIcon size={15} /></button>
            <button
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuPos({ x: r.right, y: r.bottom }); setMenuFor(menuFor === f.id ? null : f.id); }}
              title="Opções"
              className={`p-1 transition-colors ${menuFor === f.id ? 'text-brand' : 'text-creme-faint hover:text-creme'}`}
            ><Cog size={15} /></button>
          </div>
        </div>
        {colorPickerFor === f.id && (
          <div className="flex items-center gap-1.5 py-1.5" style={{ paddingLeft: depth * 12 + 26 }}>
            {FOLDER_COLORS.map((c) => (
              <button key={c} onClick={() => { setFolderColor(f, c); setColorPickerFor(null); }} className="w-4 h-4 rounded-full border border-default hover:scale-110 transition-transform" style={{ background: c }} />
            ))}
            <button onClick={() => { setFolderColor(f, null); setColorPickerFor(null); }} title="Sem cor" className="w-4 h-4 rounded-full border border-default text-[10px] text-creme-faint flex items-center justify-center">×</button>
          </div>
        )}
        {open && (
          <div>
            {subs.map((sf) => renderFolder(sf, depth + 1))}
            {sess.map((s) => (
              <SessionItem key={s.id} session={s} active={s.id === activeId} depth={depth + 1} onClick={() => selectConversation(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
            ))}
            {sess.length === 0 && subs.length === 0 && (
              <div className="text-[11px] text-creme-faint italic py-1" style={{ paddingLeft: (depth + 1) * 12 + 14 }}>vazia</div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!chatConfigured) {
    return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado — defina <code className="font-mono text-creme">.env.local</code>.</div>;
  }
  if (!agent) {
    return <div className="p-6 text-creme-faint text-[13px]">Colaborador não encontrado.</div>;
  }

  // ─── Comandos "/" (estilo Claude) — ações locais, não viram mensagem ──────────
  // Disparam ao digitar "/" no início do input. Cada um mapeia pra uma ação que já
  // existe no chat; selecionar limpa o input (o comando NÃO é enviado ao daemon).
  const slashCommands: { id: string; label: string; hint: string; icon: React.ReactNode; keywords: string[]; run: () => void }[] = [
    { id: 'limpar', label: 'Nova conversa', hint: 'limpa o contexto', icon: <Plus size={15} />, keywords: ['clear', 'nova', 'limpar', 'novo', 'reset', 'new'], run: () => newSession(null) },
    { id: 'plano', label: planMode ? 'Desligar modo plano' : 'Modo plano', hint: 'planeja antes de executar', icon: <Lightbulb size={15} />, keywords: ['plano', 'plan', 'planejar'], run: () => setPlanMode((p) => !p) },
    { id: 'anexar', label: 'Anexar arquivo', hint: 'img · PDF · vídeo', icon: <Paperclip size={15} />, keywords: ['anexar', 'arquivo', 'file', 'upload', 'attach'], run: () => fileInputRef.current?.click() },
    { id: 'agendar', label: 'Agendar rotina', hint: 'repetir no tempo', icon: <Clock size={15} />, keywords: ['agendar', 'rotina', 'schedule', 'cron'], run: () => setRoutineOpen(true) },
    { id: 'voz', label: 'Modo voz', hint: 'conversar falando', icon: <AudioLines size={15} />, keywords: ['voz', 'voice', 'falar', 'audio'], run: () => startPanelVoice() },
  ];
  const slashQuery = input.startsWith('/') && !input.includes(' ') && !input.includes('\n') ? input.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery === null ? [] : slashCommands.filter(
    (c) => slashQuery === '' || c.id.includes(slashQuery) || c.label.toLowerCase().includes(slashQuery) || c.keywords.some((k) => k.includes(slashQuery)),
  );
  const slashOpen = slashMatches.length > 0;
  const runSlash = (c: { run: () => void }) => { c.run(); setInput(''); setCmdIdx(0); };

  return (
    <div className={`-m-6 h-screen grid overflow-hidden ${navCollapsed ? 'grid-cols-[1fr]' : 'grid-cols-[300px_1fr]'}`}>
      {/* Sessões + pastas */}
      {!navCollapsed && (
      <div className="glass-strong border-r border-default flex flex-col bg-surface-1 min-h-0">
        <div className="p-3.5 border-b border-default space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-creme-faint">Conversas</span>
            <button onClick={toggleNav} title="Recolher conversas" className="w-7 h-7 rounded-md text-creme-faint hover:text-creme hover:bg-surface-hover inline-flex items-center justify-center transition-colors">
              <PanelLeftClose size={15} />
            </button>
          </div>
          <button
            onClick={() => newSession(null)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-[14px] font-semibold transition-all bg-brand/85 hover:bg-brand backdrop-blur-md border border-brand-bright/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_26px_-10px_rgba(107,143,94,0.55)]"
          >
            <Plus size={16} /> Nova sessão
          </button>
          <button
            onClick={() => newFolder(null)}
            className="glass-panel w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-default text-creme-mute text-[13px] hover:text-creme hover:bg-surface-hover transition-all"
          >
            <FolderPlus size={14} /> Nova pasta
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint pointer-events-none" />
            <input
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              placeholder="Buscar conversas…"
              className="w-full bg-surface-2 border border-default rounded-xl pl-9 pr-7 py-2 text-[12.5px] text-creme placeholder-creme-faint outline-none focus:border-brand transition-colors"
            />
            {sidebarQuery && (
              <button onClick={() => setSidebarQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-creme-faint hover:text-creme" title="Limpar"><X size={13} /></button>
            )}
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-2 space-y-0.5 transition-colors ${dragOverId === 'root' ? 'bg-brand/[0.06]' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverId('root'); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverId((c) => (c === 'root' ? null : c)); }}
          onDrop={(e) => { e.preventDefault(); dropOnTarget(null); }}
        >
          {sq ? (
            /* ── Resultados da busca (flat) ───────────────────────────────── */
            searchResults.length > 0 ? (
              <div className="space-y-0.5">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-creme-faint">{searchResults.length} resultado{searchResults.length > 1 ? 's' : ''}</div>
                {searchResults.map((s) => (
                  <SessionItem key={s.id} session={s} active={s.id === activeId} depth={0} onClick={() => selectConversation(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
                ))}
              </div>
            ) : (
              <div className="px-2 py-6 text-center text-[12px] text-creme-faint">Nenhuma conversa com "{sidebarQuery}".</div>
            )
          ) : (
          <>
          {rootFolders.map((f) => renderFolder(f, 0))}

          {/* Sessões sem pasta — com separadores por data (fixadas no topo) */}
          {ungrouped.length > 0 && (
            <div className="pt-1">
              {(() => {
                const pinned = ungrouped.filter((s) => s.pinnedAt);
                const rest = ungrouped.filter((s) => !s.pinnedAt);
                const groups = new Map<string, ChatSession[]>();
                for (const s of rest) { const b = dateBucket(s.updatedAt); if (!groups.has(b)) groups.set(b, []); groups.get(b)!.push(s); }
                const blocks: { label: string; pin?: boolean; items: ChatSession[] }[] = [];
                if (pinned.length) blocks.push({ label: 'Fixadas', pin: true, items: pinned });
                for (const b of DATE_ORDER) if (groups.has(b)) blocks.push({ label: b, items: groups.get(b)! });
                return blocks.map(({ label, pin, items }) => (
                  <div key={label}>
                    <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-creme-faint flex items-center gap-1">{pin && <Pin size={10} className="text-brand-bright" />}{label}</div>
                    <div className="space-y-0.5">
                      {items.map((s) => (
                        <SessionItem key={s.id} session={s} active={s.id === activeId} depth={0} onClick={() => selectConversation(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {sessions.length === 0 && (
            <div className="px-2 py-6 text-center text-[12px] text-creme-faint">
              Nenhuma sessão ainda.<br />Crie uma em "Nova sessão".
            </div>
          )}

          {/* Arquivadas */}
          {archivedSessions.length > 0 && (
            <div className="pt-2 mt-1 border-t border-default">
              <button onClick={() => setShowArchived((v) => !v)} className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-creme-faint hover:text-creme-mute transition-colors">
                {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Archive size={13} /> Arquivadas <span className="text-creme-faint/70">{archivedSessions.length}</span>
              </button>
              {showArchived && (
                <div className="space-y-0.5">
                  {archivedSessions.map((s) => (
                    <SessionItem key={s.id} session={s} active={s.id === activeId} depth={0} onClick={() => selectConversation(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>

        {/* Config & docs + skill de voz */}
        <div className="p-2 border-t border-default shrink-0 space-y-0.5">
          <button
            onClick={() => setEditOpen(true)}
            className="group/cfg w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-surface-hover transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-brand/12 border border-brand/20 flex items-center justify-center text-brand-bright shrink-0 group-hover/cfg:bg-brand/18 transition-colors">
              <Settings2 size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-creme-dim group-hover/cfg:text-creme truncate transition-colors">Configurar {agent.name}</div>
              <div className="text-[11px] text-creme-faint truncate">Persona · modelo · skills · canal</div>
            </div>
            <ChevronRight size={15} className="text-creme-faint opacity-0 -translate-x-1 group-hover/cfg:opacity-60 group-hover/cfg:translate-x-0 transition-all shrink-0" />
          </button>
        </div>
      </div>
      )}

      {/* Thread */}
      <div className="flex flex-col bg-surface-0 min-w-0 min-h-0">
        <div className="glass-panel relative z-30 h-16 px-6 flex items-center justify-between gap-3 border-b border-default shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {navCollapsed && (
              <button onClick={toggleNav} title="Mostrar conversas" className="w-9 h-9 rounded-lg text-creme-faint hover:text-creme hover:bg-surface-hover inline-flex items-center justify-center transition-colors shrink-0">
                <PanelLeft size={17} />
              </button>
            )}
            <button
              onClick={() => navigate('/settings')}
              title="Abrir configurações"
              className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[15px] font-bold text-white shrink-0 hover:ring-2 hover:ring-brand/50 transition-all cursor-pointer"
            >
              {agent.name[0]}
            </button>
            <button onClick={() => { setActiveId(null); setMessages([]); setView("orb"); setChatMode(false); setHistOpen(false); }} title="Voltar pra tela inicial (orbe)" className="min-w-0 text-left">
              <div className="text-[17px] font-bold tracking-tight text-creme flex items-center gap-2 hover:text-brand-bright transition-colors">
                {agent.name}
                {agent.isSupervisor && <Crown size={15} className="text-gold-bright" />}
              </div>
              <div className="text-[12.5px] text-creme-faint truncate">
                {agent.sector} · {agent.status}{active ? ` · ${active.title}` : ''}
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Toolbar segmentada de vidro — orbe · uso · voz */}
            <div className="flex items-center gap-0.5 p-1 rounded-2xl glass-panel bg-surface-2/80 border border-default shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_-16px_rgba(0,0,0,0.55)]">
              <button
                onClick={() => { setActiveId(null); setMessages([]); setView("orb"); setChatMode(false); setHistOpen(false); }}
                title="Tela inicial — o orbe"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-creme-mute hover:text-brand-bright hover:bg-brand/10 active:scale-90 transition-all"
              >
                <Sparkles size={16} />
              </button>
              <button
                onClick={() => setUsageOpen(true)}
                title="Uso por sessão — tokens, custo e contexto de cada conversa"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-creme-mute hover:text-creme hover:bg-surface-hover active:scale-90 transition-all"
              >
                <BarChart3 size={16} />
              </button>
              <button
                onClick={() => startPanelVoice()}
                title="Modo voz — conversa falando nesta conversa"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-creme-mute hover:text-brand-bright hover:bg-brand/10 active:scale-90 transition-all"
              >
                <Headphones size={16} />
              </button>
            </div>

            {/* Trocar colaborador */}
            <div className="relative">
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-2xl glass-panel bg-surface-2/80 border border-default text-[13px] font-semibold text-creme-dim hover:text-creme hover:border-brand/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_-16px_rgba(0,0,0,0.55)] transition-colors"
            >
              <span className="w-7 h-7 rounded-xl bg-brand/12 flex items-center justify-center shrink-0"><Users size={15} className="text-brand-bright" /></span>
              Colaboradores
              <ChevronDown size={14} className={`text-creme-faint transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => { setSwitcherOpen(false); setSwitcherQuery(''); }} />
                <div className="glass-strong absolute right-0 mt-1.5 w-72 max-h-[66vh] flex flex-col bg-surface-1 border border-default rounded-2xl shadow-2xl z-[56] overflow-hidden">
                  <div className="p-2 border-b border-default">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint pointer-events-none" />
                      <input
                        value={switcherQuery}
                        onChange={(e) => setSwitcherQuery(e.target.value)}
                        placeholder="Buscar colaborador…"
                        autoFocus
                        className="w-full bg-surface-2 border border-default rounded-lg pl-8 pr-2 py-1.5 text-[12.5px] text-creme placeholder-creme-faint outline-none focus:border-brand transition-colors"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto py-1.5 px-1.5 space-y-0.5">
                    {(() => {
                      const q = switcherQuery.trim().toLowerCase();
                      const list = q ? collaborators.filter((c) => c.name.toLowerCase().includes(q) || (c.sector ?? '').toLowerCase().includes(q)) : collaborators;
                      if (list.length === 0) return <div className="px-3 py-4 text-center text-[12px] text-creme-faint">Nenhum colaborador.</div>;
                      // Agrupa por setor — Liderança no topo, "Sem setor" no fim.
                      const LEAD = 'Liderança';
                      const groups = new Map<string, typeof list>();
                      for (const c of list) {
                        const key = c.isSupervisor ? LEAD : (c.sector || 'Sem setor');
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(c);
                      }
                      const keys = [...groups.keys()].sort((a, b) =>
                        a === LEAD ? -1 : b === LEAD ? 1 : a === 'Sem setor' ? 1 : b === 'Sem setor' ? -1 : a.localeCompare(b),
                      );
                      return keys.map((key) => (
                        <div key={key} className="mb-0.5">
                          <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">{key}</div>
                          {groups.get(key)!.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setSwitcherOpen(false); setSwitcherQuery(''); setView('orb'); setActiveId(null); setMessages([]); navigate(`/talk?agent=${c.id}`); }}
                              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors ${c.id === agent.id ? 'bg-brand/12 ring-1 ring-brand/25' : 'hover:bg-surface-hover'}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-creme flex items-center gap-1 truncate">{c.name}{c.isSupervisor && <Crown size={11} className="text-gold-bright shrink-0" />}</div>
                              </div>
                              {c.id === agent.id && <Check size={14} className="text-brand-bright shrink-0" />}
                            </button>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {!inChat ? (
            /* Boas-vindas estilo CORTEX — esfera animada + saudação */
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
              {/* Esfera — mais acesa (opacidade alta) */}
              <div
                className="absolute aspect-square w-[min(82vmin,640px)] rounded-full overflow-hidden opacity-90"
                style={{ WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)' }}
              >
                <NeuralSphere className="absolute inset-0" intensity={sphereIntensity} pulseSpeed={0.9} />
              </div>

              {/* Scrim — escurece o centro pra o texto/composer ficarem legíveis */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(60% 52% at 50% 50%, rgb(var(--surface-0) / 0.88) 0%, rgb(var(--surface-0) / 0.5) 48%, transparent 74%)' }}
              />

              {/* Saudação "Bom dia, Charles" (pela hora) — FORA da esfera, no topo,
                  entra DIGITANDO + brilho, como se estivesse te cumprimentando. */}
              <div className="absolute top-[6vh] inset-x-0 z-20 text-center px-6 pointer-events-none">
                <div>
                  <div className="greet-anim inline-block text-[clamp(30px,4.8vw,52px)] font-extrabold tracking-tight leading-none">
                    <Typewriter once phrases={[`${greeting}, ${firstName}`]} speed={85} />
                  </div>
                </div>
                {/* Linha dinâmica — EMBAIXO do nome, MESMO efeito de digitação + brilho */}
                {dynGreet && (
                  <div className="mt-3">
                    <div className="greet-anim inline-block text-[clamp(15px,2.4vw,23px)] font-semibold tracking-tight leading-snug max-w-[620px]">
                      <Typewriter key={dynGreet} once phrases={[dynGreet]} speed={30} />
                    </div>
                  </div>
                )}
              </div>

              <div className="relative z-10 w-full max-w-[600px] flex flex-col items-center text-center px-6">
                {/* Começo rápido — chips do COO (caixa/infra/demandas) SÓ pro Bukowiski (supervisor).
                    Pros outros colaboradores não faz sentido — fica só a barra. */}
                {/* Atenção agora — só aparece quando há algo real pra ver (escalações + sistemas com problema) */}
                {agent.isSupervisor && (() => {
                  const prio: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#64748b' };
                  const items: { color: string; text: string; on: () => void }[] = [
                    ...escalations.map((e) => ({ color: prio[e.priority] ?? '#f59e0b', text: `Escalação · ${e.agentName}: ${e.reason}`, on: () => send(`Me ajuda a resolver a escalação do ${e.agentName}: ${e.reason}`) })),
                    ...(orbSystems?.issues ?? []).map((s) => ({ color: '#ef4444', text: `Sistema · ${s.name} (${s.status.replace(/_/g, ' ')})`, on: () => navigate('/status') })),
                  ];
                  if (items.length === 0) return null;
                  return (
                    <div className="w-full mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-left backdrop-blur-md shadow-[0_12px_30px_-18px_rgba(0,0,0,0.7)]">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/90 mb-2">
                        <AlertTriangle size={12} /> Atenção agora · {items.length}
                      </div>
                      <div className="space-y-1.5">
                        {items.slice(0, 4).map((a, i) => (
                          <button key={i} onClick={a.on} className="group/at w-full flex items-center gap-2 text-[13px] text-creme-dim hover:text-creme transition-colors text-left">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
                            <span className="flex-1 min-w-0 truncate">{a.text}</span>
                            <ChevronRight size={13} className="text-creme-faint shrink-0 group-hover/at:translate-x-0.5 transition-transform" />
                          </button>
                        ))}
                        {items.length > 4 && <div className="text-[11.5px] text-creme-faint pl-3.5">+{items.length - 4} mais</div>}
                      </div>
                    </div>
                  );
                })()}

                {/* Pulse do dia — KPIs reais (store + async), clicáveis. Só pro supervisor. */}
                {agent.isSupervisor && (
                  <div className="flex items-center justify-center gap-2 flex-wrap mb-5">
                    {[
                      { icon: Activity, value: String(metrics?.activeAgents ?? agents.filter((a) => a.status === 'online').length), label: 'online', on: () => send('Como tá o time agora? Quem está online e com o quê.') },
                      { icon: BarChart3, value: String(metrics?.totalToday ?? 0), label: 'hoje', on: () => send('Resumo do que rolou hoje até agora.') },
                      { icon: ListChecks, value: orbDemands == null ? '—' : String(orbDemands), label: 'demandas', on: () => navigate('/demands') },
                      { icon: Cog, value: orbSystems ? `${orbSystems.ok}/${orbSystems.total}` : '—', label: 'sistemas', on: () => navigate('/status') },
                    ].map((k) => (
                      <button
                        key={k.label}
                        onClick={k.on}
                        className="flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-2xl bg-surface-2/80 border border-default hover:border-brand/50 hover:bg-surface-hover transition-all shadow-[0_10px_28px_-18px_rgba(0,0,0,0.7)]"
                      >
                        <k.icon size={15} className="text-brand-bright shrink-0" />
                        <span className="text-[15px] font-bold text-creme tabular-nums leading-none">{k.value}</span>
                        <span className="text-[12.5px] font-medium text-creme-mute leading-none">{k.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Composer no MEIO (igual à referência) — onde estava */}
                <div className="w-full">
                  {recording ? (
                    <AudioRecorderBar agentId={agentId ?? ''} onResult={(t) => { setRecording(false); if (t) setInput((c) => (c ? `${c} ${t}` : t)); }} onCancel={() => setRecording(false)} />
                  ) : (
                    <div className="glass-panel flex items-center gap-2 bg-surface-2 border border-default rounded-2xl pl-4 pr-2.5 py-2.5 focus-within:border-brand transition-colors shadow-[0_18px_46px_-22px_rgba(0,0,0,0.75)]">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        rows={1}
                        placeholder={`Mensagem para ${agent.name}…`}
                        className="flex-1 resize-none bg-transparent py-1 text-[15px] text-creme placeholder-creme-faint focus:outline-none max-h-32"
                      />
                      <button onClick={() => startPanelVoice()} title="Modo voz" className="w-9 h-9 rounded-xl flex items-center justify-center text-creme-faint hover:text-creme hover:bg-surface-hover transition-colors"><Headphones size={17} /></button>
                      <button onClick={() => setRecording(true)} title="Gravar áudio" className="w-9 h-9 rounded-xl flex items-center justify-center text-creme-faint hover:text-creme hover:bg-surface-hover transition-colors"><Mic size={17} /></button>
                      <button onClick={() => send()} disabled={sending || !input.trim()} className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors">{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button>
                    </div>
                  )}
                </div>

                {/* Modo de fala — briefing falado, ABAIXO da barra. Texto adaptado ao colaborador. */}
                <button
                  onClick={() => { setTtsOn(true); send(agent.isSupervisor
                    ? 'Me dá um briefing falado e curtinho do meu dia: caixa, infra, demandas em aberto e agenda. Fala de forma natural, como se estivesse me contando ao vivo.'
                    : 'Me dá um briefing falado e curtinho de como está a sua área agora: o que precisa de atenção, pendências e próximos passos. Fala natural, como se estivesse me contando ao vivo.'); }}
                  className="mt-5 flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-2xl border border-gold/45 bg-gold/10 text-gold-bright text-[14px] font-semibold hover:bg-gold/20 transition-colors shadow-[0_12px_30px_-16px_rgba(0,0,0,0.7)]"
                >
                  <Volume2 size={15} className="shrink-0" /> Ouvir briefing do dia
                </button>

                {/* Histórico: lista clicável (dropdown) + retomar última. Você escolhe ir pro chat. */}
                {(() => {
                  const visible = sessions.filter((x) => !x.archivedAt);
                  if (visible.length === 0) return null;
                  const sorted = [...visible].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
                  const last = sorted[0];
                  return (
                    <div className="mt-5 relative">
                      <div className="flex items-center gap-3 text-[13px] rounded-full bg-surface-1/80 backdrop-blur-md border border-default px-4 py-2 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.65)]">
                        <button onClick={() => setHistOpen((o) => !o)} className="flex items-center gap-1.5 text-creme-mute hover:text-creme transition-colors">
                          <Clock size={13} className="text-creme-faint" /> histórico <span className="text-creme font-bold">{visible.length}</span>
                          <ChevronDown size={12} className={`text-creme-faint transition-transform ${histOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <span className="w-px h-3.5 bg-creme/15" />
                        <button onClick={() => enterConversation(active && messages.length > 0 ? active.id : last.id)} className="flex items-center gap-1.5 text-brand-bright font-semibold hover:text-brand transition-colors min-w-0 max-w-[280px]">
                          <ChevronRight size={13} className="shrink-0" /> <span className="truncate">{last.title ? `Retomar · ${last.title}` : 'retornar ao chat'}</span>
                        </button>
                      </div>
                      {histOpen && (
                        <>
                          <div className="fixed inset-0 z-[40]" onClick={() => setHistOpen(false)} />
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 max-h-72 overflow-y-auto bg-surface-1 border border-default rounded-xl shadow-2xl z-[41] py-1.5 text-left">
                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">Conversas recentes</div>
                            {sorted.map((s) => (
                              <button key={s.id} onClick={() => selectConversation(s.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors">
                                <MessageSquare size={13} className="text-creme-faint shrink-0" />
                                <span className="flex-1 min-w-0 truncate text-[13px] text-creme-dim">{s.title}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-6 py-6 space-y-5">
              {/* Resumo da conversa (TL;DR) — flutua no topo em conversas longas */}
              {messages.length >= 8 && !waiting && (
                <div className="sticky top-0 z-20 flex justify-center pointer-events-none -mt-2 mb-1">
                  <button
                    onClick={() => send('Faz um TL;DR rápido da nossa conversa até aqui: principais decisões, o que você já executou, o que ficou pendente e os próximos passos. Curto, em bullets.')}
                    title="Resumir esta conversa"
                    className="pointer-events-auto flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 rounded-full glass-panel bg-surface-2/80 border border-default text-[12px] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.6)] hover:border-brand/40 transition-colors"
                  >
                    <History size={13} className="text-brand-bright shrink-0" />
                    <span className="font-semibold text-creme-dim">Resumo da conversa</span>
                    <span className="text-creme-faint">{messages.length} mensagens · TL;DR</span>
                  </button>
                </div>
              )}
              {messages.map((m, mi) =>
                m.role === 'user' ? (() => {
                  const COLLAPSE_AT = 440;
                  const isLong = m.content.length > COLLAPSE_AT;
                  const open = expandedMsgs.has(m.id);
                  const shown = isLong && !open ? m.content.slice(0, COLLAPSE_AT).trimEnd() : m.content;
                  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                  <div key={m.id} className="group flex flex-col items-end gap-1">
                    <div className="flex items-end gap-2.5 max-w-[82%]">
                      <div className="px-[18px] py-3 rounded-[20px] rounded-br-md bg-brand text-white text-[15px] leading-[1.72] shadow-[0_12px_28px_-16px_rgba(0,0,0,0.55)] min-w-0">
                        {m.attachments.length > 0 && <MessageAttachments items={m.attachments} />}
                        {m.content && (
                          <span className="whitespace-pre-wrap">
                            {shown}{isLong && !open && '… '}
                            {isLong && (
                              <button onClick={() => toggleExpanded(m.id)} className="text-white/85 underline underline-offset-2 hover:text-white text-[13px] font-semibold">
                                {open ? 'ver menos' : 'ver mais'}
                              </button>
                            )}
                          </span>
                        )}
                        {m.status === 'error' && (
                          <div className="text-[11px] mt-1 text-white/80 flex items-center gap-2 flex-wrap">
                            <span>erro: {m.error}</span>
                            <button onClick={() => send(m.content)} disabled={sending} className="underline underline-offset-2 hover:text-white disabled:opacity-50 shrink-0">↻ Reenviar</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* horário + ações ao passar o mouse */}
                    <div className="flex items-center gap-1 mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {time && <span className="text-[10.5px] text-creme-faint mr-1">{time}</span>}
                      {[
                        { icon: Pencil, label: 'Editar & reenviar', on: () => { setInput(m.content); useAppStore.getState().addToast('Mensagem no campo — ajuste e reenvie', 'green'); } },
                        { icon: Copy, label: 'Copiar', on: () => copyMsg(m.content) },
                        { icon: GitBranch, label: 'Bifurcar a conversa', on: () => { if (active) forkSessionAction(active); } },
                        { icon: ListChecks, label: 'Virar demanda', on: () => msgToDemand(m.content) },
                      ].map((a) => (
                        <button key={a.label} onClick={a.on} title={a.label} className="group/act h-7 px-1.5 rounded-lg bg-surface-3 border border-default text-creme-faint hover:text-creme hover:bg-surface-hover flex items-center transition-all">
                          <a.icon size={12} className="shrink-0" />
                          <span className="max-w-0 group-hover/act:max-w-[150px] group-hover/act:ml-1.5 overflow-hidden whitespace-nowrap text-[11px] font-semibold transition-all duration-200">{a.label}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => improveMyPrompt(m)}
                        disabled={improvingId === m.id}
                        title="Melhorar meu prompt (IA reescreve)"
                        className="group/act h-7 px-1.5 rounded-lg bg-gold/10 border border-gold/30 text-gold-bright hover:bg-gold/20 flex items-center transition-all disabled:opacity-60"
                      >
                        {improvingId === m.id ? <Loader2 size={12} className="animate-spin shrink-0" /> : <Sparkles size={12} className="shrink-0" />}
                        <span className="max-w-0 group-hover/act:max-w-[160px] group-hover/act:ml-1.5 overflow-hidden whitespace-nowrap text-[11px] font-semibold transition-all duration-200">{improvingId === m.id ? 'Melhorando…' : 'Melhorar prompt'}</span>
                      </button>
                    </div>
                  </div>
                  );
                })() : (
                  <div key={m.id} className="group flex max-w-[88%]">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-creme-mute mb-1.5 tracking-wide">{agent.name}</div>
                      <div className="px-[18px] py-3.5 rounded-[20px] rounded-tl-md bg-surface-2 border border-default text-creme text-[15px] leading-[1.72] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_32px_-22px_rgba(0,0,0,0.6)]">
                        <Markdown text={m.content} onAction={(t) => send(t)} />
                        {m.status === 'error' && <div className="text-[11px] mt-1 text-semantic-red">erro: {m.error}</div>}
                      </div>
                      <MessageSteps refId={[...messages.slice(0, mi)].reverse().find((x) => x.role === 'user')?.id ?? null} onAct={handleStepAct} />
                      {/* Ações ao passar o mouse */}
                      {m.status === 'done' && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {[
                            { icon: Copy, label: 'Copiar', on: () => copyMsg(m.content), gold: false },
                            { icon: Volume2, label: 'Ouvir', on: () => speakReply(m.content), gold: true },
                            { icon: RefreshCw, label: 'Refazer', on: () => regenerate(mi), gold: false },
                            { icon: ListChecks, label: 'Virar demanda', on: () => msgToDemand(m.content), gold: false },
                          ].map((a) => (
                            <button key={a.label} onClick={a.on} title={a.label} className={`group/act h-7 px-1.5 rounded-lg border flex items-center transition-all ${a.gold ? 'bg-surface-3 border-gold/30 text-gold-bright hover:bg-gold/10' : 'bg-surface-3 border-default text-creme-faint hover:text-creme hover:bg-surface-hover'}`}>
                              <a.icon size={13} className="shrink-0" />
                              <span className="max-w-0 group-hover/act:max-w-[150px] group-hover/act:ml-1.5 overflow-hidden whitespace-nowrap text-[11px] font-semibold transition-all duration-200">{a.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Sugestões de próximo passo (só na última resposta) */}
                      {m.status === 'done' && mi === messages.length - 1 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {['Detalha isso', 'Resume em 1 linha', 'Próximos passos', 'Vira relatório'].map((f) => (
                            <button key={f} onClick={() => send(f)} className="flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-xl bg-surface-3 border border-brand/25 text-creme-dim text-[12.5px] font-medium hover:border-brand/50 hover:text-creme hover:bg-surface-hover transition-all">
                              <ArrowRight size={13} className="text-brand-bright" /> {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {waiting && (
                <div className="flex">
                  <div className="flex items-center gap-1.5 bg-surface-2 border border-default rounded-[20px] rounded-tl-md px-4 py-3.5">
                    <span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '.16s' }} /><span className="typing-dot" style={{ animationDelay: '.32s' }} />
                    <span className="text-[12.5px] text-creme-mute ml-1.5">{agent.name} está digitando…</span>
                  </div>
                </div>
              )}
              {waiting && <ThinkingActivity agentName={agent.name} refId={lastUserMsgId} onAct={handleStepAct} />}
            </div>
          )}
        </div>

        {inChat && (
        <div className="px-6 py-4 border-t border-default shrink-0">
          <div className="flex items-center justify-between mb-2 px-1 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CortexBrainBar />
              <CortexUsageBadge />
              {planMode && (
                <button onClick={() => setPlanMode(false)} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/15 text-brand-bright text-[11px] shrink-0" title="Desligar modo plano">
                  <Lightbulb size={11} /> Modo plano <X size={11} />
                </button>
              )}
            </div>
            {active && active.contextTokens > 0 && <ContextMeter tokens={active.contextTokens} />}
          </div>

          {(attachments.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap gap-2 mb-2 px-1">
              {attachments.map((a, i) => (
                <div key={a.path} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-surface-3 border border-default text-[11.5px] text-creme-dim max-w-[180px]">
                  <span>{/^image\//.test(a.mime) ? '🖼️' : /^video\//.test(a.mime) ? '🎬' : '📄'}</span>
                  <span className="truncate">{a.name}</span>
                  <button onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== i))} className="text-creme-faint hover:text-semantic-red shrink-0"><X size={13} /></button>
                </div>
              ))}
              {uploading > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-3 border border-default text-[11.5px] text-creme-faint">
                  <Loader2 size={12} className="animate-spin" /> enviando {uploading}…
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
          {recording ? (
            <AudioRecorderBar
              agentId={agentId ?? ''}
              onResult={(t) => { setRecording(false); if (t) setInput((cur) => (cur ? `${cur} ${t}` : t)); }}
              onCancel={() => setRecording(false)}
            />
          ) : (
          <div className="glass-panel relative flex items-end gap-2.5 bg-surface-2 border border-default rounded-2xl px-3 py-2 focus-within:border-brand transition-colors">
            {slashOpen && (
              <div className="absolute bottom-full mb-2 left-0 right-0 z-[61] rounded-xl border border-default bg-surface-1 shadow-2xl p-1.5 max-h-72 overflow-y-auto">
                <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-creme-faint">Comandos</div>
                {slashMatches.map((c, i) => (
                  <button
                    key={c.id}
                    onMouseEnter={() => setCmdIdx(i)}
                    onClick={() => runSlash(c)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${i === Math.min(cmdIdx, slashMatches.length - 1) ? 'bg-brand/10 text-brand-bright' : 'text-creme-mute hover:bg-surface-hover'}`}
                  >
                    <span className={`shrink-0 ${i === Math.min(cmdIdx, slashMatches.length - 1) ? 'text-brand-bright' : 'text-creme-faint'}`}>{c.icon}</span>
                    <span className="font-mono text-[12px] shrink-0 opacity-80">/{c.id}</span>
                    <span className="flex-1 text-left font-medium">{c.label}</span>
                    <span className="text-[10.5px] text-creme-faint shrink-0">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="relative shrink-0">
              <button
                onClick={() => { setPlusOpen((o) => !o); setDelegateOpen(false); }}
                title="Mais ações"
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${plusOpen ? 'bg-brand/15 text-brand-bright' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}
              >
                <Plus size={18} />
              </button>
              {plusOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => { setPlusOpen(false); setDelegateOpen(false); }} />
                  <div className="absolute bottom-full mb-2 left-0 z-[61] w-64 rounded-xl border border-default bg-surface-1 shadow-2xl p-1.5">
                    <MenuRow icon={<Paperclip size={15} />} label="Anexar arquivo" hint="img · PDF · vídeo" onClick={() => { setPlusOpen(false); fileInputRef.current?.click(); }} />
                    <MenuRow icon={<ListChecks size={15} />} label="Virar demanda" hint="2º plano" disabled={!input.trim()} onClick={() => agent && toDemand(agent.id)} />
                    <div>
                      <MenuRow icon={<Users size={15} />} label="Delegar pra…" chevron disabled={!input.trim()} onClick={() => setDelegateOpen((o) => !o)} />
                      {delegateOpen && (
                        <div className="mt-1 mb-1 max-h-48 overflow-y-auto rounded-lg border border-default bg-surface-2 p-1">
                          {collaborators.map((c) => (
                            <button key={c.id} onClick={() => toDemand(c.id)} className="w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] text-creme-mute hover:bg-surface-hover hover:text-creme flex items-center gap-2">
                              {c.id === 'bukowiski-thribus' && <Crown size={12} className="text-gold-bright shrink-0" />}
                              <span className="truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <MenuRow icon={<Lightbulb size={15} />} label="Modo plano" hint={planMode ? 'ligado' : 'planeja antes'} active={planMode} onClick={() => { setPlanMode((p) => !p); setPlusOpen(false); }} />
                    <MenuRow icon={<Clock size={15} />} label="Agendar rotina" hint="repetir" onClick={() => { setPlusOpen(false); setRoutineOpen(true); }} />
                  </div>
                </>
              )}
            </div>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setCmdIdx(0); }}
              onPaste={(e) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) { e.preventDefault(); addFiles(fs); } }}
              onKeyDown={(e) => {
                if (slashOpen) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIdx((i) => (i + 1) % slashMatches.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); runSlash(slashMatches[Math.min(cmdIdx, slashMatches.length - 1)]); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setInput(''); return; }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={voice.listening ? 'Ouvindo… fale agora' : `Mensagem para ${agent.name}…`}
              className="flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[14.5px] text-creme placeholder-creme-faint focus:outline-none max-h-40"
            />
            {voice.ttsSupported && (
              <button
                onClick={() => { const next = !ttsOn; setTtsOn(next); if (!next) voice.cancelSpeak(); }}
                title={ttsOn ? 'Voz do colaborador: ligada' : 'Voz do colaborador: desligada'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${ttsOn ? 'bg-brand/15 text-brand-bright' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}
              >
                {ttsOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
            )}
            <button
              onClick={() => setRecording(true)}
              title="Gravar áudio (transcrever)"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors text-creme-faint hover:text-creme hover:bg-surface-hover"
            >
              <Mic size={17} />
            </button>
            {waiting && lastUserMsgId ? (
              <button
                onClick={() => cancelTurn(lastUserMsgId)}
                title="Parar a resposta"
                className="w-10 h-10 rounded-xl bg-semantic-red/15 text-semantic-red flex items-center justify-center shrink-0 hover:bg-semantic-red/25 transition-colors animate-pulse"
              >
                <Square size={15} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={sending || uploading > 0 || (!input.trim() && attachments.length === 0)}
                className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors"
              >
                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            )}
          </div>
          )}
        </div>
        )}
      </div>

      {usageOpen && (
        <SessionUsageModal
          agentId={agent.id}
          agentName={agent.name}
          sessions={sessions}
          folders={folders}
          activeId={activeId}
          onClose={() => setUsageOpen(false)}
          onOpenSession={(id) => { setActiveId(id); setMessages([]); setView('chat'); setChatMode(true); }}
        />
      )}
      {infoOpen && <AgentInfoModal agent={agent} onClose={() => setInfoOpen(false)} onEdit={() => setEditOpen(true)} />}
      {editOpen && <AgentDetailModal agent={agent} onClose={() => setEditOpen(false)} />}
      {routineOpen && userId && (
        <RoutineModal
          userId={userId}
          agents={collaborators}
          initialTitle={input.trim() || undefined}
          onClose={() => setRoutineOpen(false)}
          onCreated={() => { setRoutineOpen(false); setInput(''); useAppStore.getState().addToast('Rotina agendada', 'green'); }}
        />
      )}

      {/* Menu (engrenagem) da pasta */}
      {menuFor && menuPos && (() => {
        const mf = folders.find((x) => x.id === menuFor);
        if (!mf) return null;
        const top = Math.min(menuPos.y + 4, window.innerHeight - 188);
        return (
          <>
            <div className="fixed inset-0 z-[58]" onClick={() => setMenuFor(null)} />
            <div className="fixed z-[59] w-44 bg-surface-1 border border-default rounded-xl shadow-2xl py-1 text-[13px]" style={{ left: Math.max(8, menuPos.x - 176), top }}>
              <button onClick={() => { newSession(mf.id); setMenuFor(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover text-creme-dim"><Plus size={14} className="text-creme-faint" /> Nova sessão</button>
              <button onClick={() => { setColorPickerFor(colorPickerFor === mf.id ? null : mf.id); setMenuFor(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover text-creme-dim"><Palette size={14} className="text-creme-faint" /> Mudar cor</button>
              <button onClick={() => { renameFolderAction(mf); setMenuFor(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover text-creme-dim"><Pencil size={14} className="text-creme-faint" /> Renomear</button>
              <div className="my-1 border-t border-default" />
              <button onClick={() => { removeFolder(mf); setMenuFor(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover text-semantic-red"><Trash2 size={14} /> Apagar</button>
            </div>
          </>
        );
      })()}

      {/* Menu (…) de uma conversa */}
      {sessMenu && (() => {
        const s = sessions.find((x) => x.id === sessMenu.id);
        if (!s) return null;
        return (
          <SessionContextMenu
            session={s}
            folders={folders}
            colors={FOLDER_COLORS}
            pos={sessMenu}
            onClose={() => setSessMenu(null)}
            onRename={() => renameSessionAction(s)}
            onTogglePin={() => togglePin(s)}
            onSetColor={(c) => changeColor(s, c)}
            onMove={(fid) => moveToFolder(s, fid)}
            onFork={() => forkSessionAction(s)}
            onTranscript={() => setTranscriptFor(s)}
            onToggleArchive={() => toggleArchive(s)}
            onDelete={() => removeSession(s.id)}
          />
        );
      })()}

      {transcriptFor && agent && (
        <TranscriptModal sessionId={transcriptFor.id} title={transcriptFor.title} agentName={agent.name} onClose={() => setTranscriptFor(null)} />
      )}

      {/* Modo voz — tela cheia imersiva (estilo CORTEX) */}
      {voiceMode && (
        <div
          className="fixed inset-0 z-[65] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at center, #142e1f 0%, #040805 76%)' }}
        >
          <style>{`@keyframes orbDot{0%,100%{opacity:.2;transform:scaleY(1)}50%{opacity:1;transform:scaleY(2.4)}}`}</style>

          {/* Rede de fundo — esfera grande bem esmaecida (igual ao orbe) */}
          <div className="absolute inset-0 opacity-[0.18] pointer-events-none">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[140vmin]">
              <NeuralSphere className="absolute inset-0" intensity={0.2} speedMultiplier={0.6} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={1} />
            </div>
          </div>

          {/* Topo: rótulo + mutar mic + fechar */}
          <div className="absolute top-0 inset-x-0 h-16 px-7 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-creme-faint">Modo voz{panelMuted ? ' · mic pausado' : ''}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={togglePanelMute}
                title={panelMuted ? 'Religar o microfone' : 'Pausar o microfone (ele não escuta)'}
                className={`w-9 h-9 rounded-full border backdrop-blur flex items-center justify-center transition-colors ${panelMuted ? 'border-semantic-red/50 bg-semantic-red/15 text-semantic-red' : 'border-default bg-surface-1/60 text-creme-mute hover:text-creme hover:bg-surface-hover'}`}
              >
                {panelMuted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <button
                onClick={stopPanelVoice}
                title="Encerrar o modo voz"
                className="w-9 h-9 rounded-full border border-default bg-surface-1/60 backdrop-blur text-creme-mute hover:text-creme hover:bg-surface-hover flex items-center justify-center transition-colors"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Esfera central + status — reage à voz (nível do mic) e muda de COR por
              estado, igual ao CORTEX: verde (ouvindo/falando) → âmbar (pensando) →
              azul (respondendo). */}
          {(() => {
            const hue = panelVoiceState === 'thinking' ? -62 : panelVoiceState === 'speaking' ? 95 : 0;
            const color = panelVoiceState === 'thinking' ? '244 194 103' : panelVoiceState === 'speaking' ? '127 176 245' : '124 217 154';
            const label = panelVoiceState === 'speaking' ? 'Respondendo' : panelVoiceState === 'thinking' ? 'Pensando' : panelVoiceState === 'talking' ? 'Você falando' : 'Ouvindo';
            const talking = panelVoiceState === 'talking';
            const responding = panelVoiceState === 'speaking';
            const reacting = talking || responding;
            // Você falando → reage ao mic. Ele respondendo → reage ao áudio REAL do TTS.
            const intensity = responding ? 0.6 + panelPlayLevel * 0.4 : panelVoiceState === 'thinking' ? 0.5 : 0.4 + panelLevel * 0.55;
            const sphereScale = talking ? 1 + panelLevel * 0.16 : responding ? 1 + panelPlayLevel * 0.22 : 1;
            const sphereAnim = undefined;
            return (
              <div className="relative z-10 flex flex-col items-center gap-8">
                <style>{`@keyframes orbSpin{to{transform:rotate(360deg)}}@keyframes voiceBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}@keyframes voiceRipple{0%{transform:scale(0.9);opacity:.55}100%{transform:scale(1.7);opacity:0}}`}</style>
                <div className="relative aspect-square w-[min(60vmin,540px)]">
                  {/* Ondas (ripple) emanando — quando você fala ou ele responde */}
                  {reacting && [0, 1, 2].map((i) => (
                    <span key={i} className="absolute inset-0 rounded-full border-2 pointer-events-none" style={{ borderColor: `rgba(${color}/0.5)`, animation: `voiceRipple ${responding ? 1.9 : 1.5}s ease-out ${i * 0.55}s infinite` }} />
                  ))}
                  <div
                    className="absolute inset-0 rounded-full overflow-hidden transition-[filter,transform] duration-300"
                    style={{ WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', filter: hue ? `hue-rotate(${hue}deg)` : undefined, transform: `scale(${sphereScale})`, animation: sphereAnim }}
                  >
                    <NeuralSphere className="absolute inset-0" intensity={intensity} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} />
                  </div>
                  <div className="absolute -inset-6 rounded-full pointer-events-none transition-all duration-500" style={{ background: `radial-gradient(circle, rgba(${color}/${reacting ? 0.32 : 0.22}) 0%, transparent 66%)` }} />
                  <div className="absolute -inset-[7%] rounded-full border border-dashed pointer-events-none" style={{ borderColor: `rgba(${color}/0.3)`, animation: 'orbSpin 18s linear infinite' }} />
                </div>
                <div className="flex items-center gap-2.5 px-5 py-2 rounded-full border backdrop-blur transition-all duration-300" style={{ borderColor: `rgba(${color}/0.4)`, background: `rgba(${color}/0.08)` }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: `rgb(${color})` }} />
                  <span className="text-[12px] font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${color})` }}>{label}</span>
                </div>
              </div>
            );
          })()}

          {/* Fila de falas — canto inferior esquerdo. Clique no item pra ver o texto
              completo. Mostra o que está processando agora e o que está na fila. */}
          {panelTurns.length > 0 && (() => {
            const pend = panelTurns.filter((t) => t.status !== 'done').length;
            return (
            <div className="absolute bottom-8 left-7 z-10 w-[min(440px,48vw)] flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.22em] text-white/85">
                <ListChecks size={15} className="text-brand-bright" />
                Fila {pend > 0 && <span className="ml-0.5 px-2 py-0.5 rounded-full bg-brand text-white text-[11px]">{pend} pendente{pend > 1 ? 's' : ''}</span>}
              </div>
              <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-1">
                {panelTurns.map((t) => {
                  const done = t.status === 'done';
                  const queued = t.status === 'queued';
                  const editing = editingTurn === t.id;
                  // Etapa NA FILA em edição → textarea + salvar/remover.
                  if (queued && editing) {
                    return (
                      <div key={t.id} className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-brand-bright/60 bg-[#16241a]">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-bright">Editar etapa</div>
                        <textarea
                          value={editTurnText}
                          onChange={(e) => setEditTurnText(e.target.value)}
                          rows={3}
                          autoFocus
                          className="w-full resize-none rounded-lg bg-black/60 border border-default px-3 py-2 text-[14px] text-white leading-relaxed focus:outline-none focus:border-brand-bright"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={() => { panelVoiceRef.current?.editTurn(t.id, editTurnText.trim()); setEditingTurn(null); }} disabled={!editTurnText.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-[12px] font-semibold disabled:opacity-40 hover:bg-brand-bright transition-colors"><Check size={13} /> Salvar</button>
                          <button onClick={() => setEditingTurn(null)} className="px-3 py-1.5 rounded-lg border border-default text-creme-mute text-[12px] hover:text-creme transition-colors">Cancelar</button>
                          <button onClick={() => { panelVoiceRef.current?.removeTurn(t.id); setEditingTurn(null); }} title="Remover da fila" className="ml-auto w-8 h-8 rounded-lg border border-semantic-red/40 text-semantic-red flex items-center justify-center hover:bg-semantic-red/15 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  }
                  const open = expandedTurn === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl border transition-colors ${t.status === 'processing' ? 'border-brand-bright/60 bg-[#16241a]' : done ? 'border-white/10 bg-black/70' : 'border-brand/30 bg-black/80'}`}
                    >
                      {t.status === 'processing'
                        ? <Loader2 size={16} className="text-brand-bright animate-spin shrink-0 mt-0.5" />
                        : done
                          ? <Check size={16} className="text-brand-bright shrink-0 mt-0.5" />
                          : <Clock size={16} className="text-brand-bright shrink-0 mt-0.5" />}
                      <button onClick={() => setExpandedTurn(open ? null : t.id)} className="min-w-0 flex-1 text-left">
                        <div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1 ${done ? 'text-white/45' : 'text-brand-bright'}`}>
                          {t.status === 'processing' ? 'Respondendo' : done ? 'Feito' : 'Na fila'}
                        </div>
                        <span className={`block text-[14px] leading-relaxed ${done ? 'text-white/60' : 'text-white'} ${open ? 'whitespace-pre-wrap' : 'truncate'}`}>{t.text}</span>
                        <div className="text-[10px] text-white/40 mt-1">{open ? 'tocar pra recolher' : 'tocar pra ver tudo'}</div>
                      </button>
                      {queued && (
                        <button onClick={() => { setEditingTurn(t.id); setEditTurnText(t.text); }} title="Editar etapa" className="shrink-0 w-8 h-8 rounded-lg border border-brand/40 text-brand-bright flex items-center justify-center hover:bg-brand/15 transition-colors">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Efeito de digitação (typewriter). once=true → digita uma vez e para (entrada);
// senão fica digitando/apagando as frases em loop. Cursor piscando.
function Typewriter({ phrases, className, once = false, speed = 65 }: { phrases: string[]; className?: string; once?: boolean; speed?: number }) {
  const [txt, setTxt] = useState('');
  const [pi, setPi] = useState(0);
  const [del, setDel] = useState(false);
  useEffect(() => {
    const full = phrases[pi % phrases.length] ?? '';
    if (once && txt === full) return; // terminou de digitar → para
    let delay = del ? Math.round(speed * 0.6) : speed;
    if (!del && txt === full) delay = 1700;
    else if (del && txt === '') delay = 320;
    const t = setTimeout(() => {
      if (!del && txt === full) { setDel(true); return; }
      if (del && txt === '') { setDel(false); setPi((p) => (p + 1) % phrases.length); return; }
      setTxt(del ? full.slice(0, txt.length - 1) : full.slice(0, txt.length + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [txt, del, pi, phrases, once, speed]);
  return <span className={className}>{txt}<span className="tw-caret">|</span></span>;
}

function SessionItem({ session, active, depth = 0, onClick, onMenu, onDragStartItem }: { session: ChatSession; active: boolean; depth?: number; onClick: () => void; onMenu: (pos: { x: number; y: number }) => void; onDragStartItem: () => void }) {
  const openMenu = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu({ x: r.right, y: r.bottom }); };
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStartItem(); e.dataTransfer.effectAllowed = 'move'; }}
      onContextMenu={openMenu}
      className={`group flex items-center gap-2.5 pr-2 py-2.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-brand/10' : 'hover:bg-surface-hover'}`}
      style={{ paddingLeft: depth * 14 + 12 }}
      onClick={onClick}
    >
      {session.archivedAt
        ? <Archive size={14} className="text-creme-faint shrink-0" />
        : <MessageSquare size={15} className={`shrink-0 ${session.color ? '' : 'text-creme-faint'}`} style={session.color ? { color: session.color } : undefined} />}
      {session.pinnedAt && !session.archivedAt && <Pin size={11} className="text-brand-bright shrink-0 -ml-1" />}
      <span className={`flex-1 min-w-0 text-[14.5px] truncate ${active ? 'text-creme font-medium' : 'text-creme-mute'}`}>{session.title}</span>
      <button onClick={openMenu} className="opacity-0 group-hover:opacity-100 text-creme-faint hover:text-creme p-1 shrink-0" title="Opções da conversa">
        <MoreVertical size={14} />
      </button>
    </div>
  );
}

// Linha do menu "+" do chat.
function MenuRow({ icon, label, hint, onClick, disabled, active, chevron }: {
  icon: React.ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean; active?: boolean; chevron?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'bg-brand/10 text-brand-bright' : 'text-creme-mute hover:bg-surface-hover hover:text-creme'}`}
    >
      <span className={`shrink-0 ${active ? 'text-brand-bright' : 'text-creme-faint'}`}>{icon}</span>
      <span className="flex-1 text-left font-medium">{label}</span>
      {hint && <span className="text-[10.5px] text-creme-faint shrink-0">{hint}</span>}
      {chevron && <ChevronRight size={13} className="text-creme-faint shrink-0" />}
    </button>
  );
}

// Janela de contexto da conversa (igual o Claude: "X / 1M"). Opus 4.8 = 1M tokens.
function ContextMeter({ tokens }: { tokens: number }) {
  const MAX = 1_000_000;
  const pct = Math.min(100, (tokens / MAX) * 100);
  const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  return (
    <div className="flex items-center gap-2 text-[11px] text-creme-faint shrink-0" title="Janela de contexto desta conversa (tokens usados na sessão)">
      <span>contexto</span>
      <div className="w-16 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 85 ? 'bg-amber-400' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-creme-mute">{fmt(tokens)}/1M · {pct.toFixed(0)}%</span>
    </div>
  );
}
