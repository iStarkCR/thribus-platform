import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Send, Crown, Loader2, Plus, FolderPlus, Folder, ChevronDown, ChevronRight, Trash2, MessageSquare,
  Users, Check, Settings2, Mic, MicOff, Volume2, VolumeX, Pencil, Palette, FolderPlus as SubfolderIcon, Headphones, AudioLines, X, Cog, Paperclip, Square,
  ListChecks, Lightbulb, Clock, BarChart3, MoreVertical, Archive, Pin,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { isStopPhrase, isNoise, mapVoiceState, ORB_FOLDER_NAME, type VoiceState } from '@/hooks/useOrbConversation';
import { VoiceController } from '@/lib/voiceMode';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { CortexBrainBar } from '@/components/cortex/CortexBrainBar';
import { CortexUsageBadge } from '@/components/cortex/CortexUsageBadge';
import { Markdown } from '@/components/shared/Markdown';
import { ThinkingActivity, MessageSteps } from '@/components/shared/ThinkingActivity';
import { listMessages, sendMessage, cancelMessage, subscribeChat, chatConfigured, uploadAttachment, type ChatMessage, type Attachment } from '@/services/collaboratorChat';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { createDemand } from '@/services/demands';
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
import { getVoiceConfig, ttsBlob, transcribeBlob, quickAck, type VoiceConfig } from '@/services/voiceSkill';

const BUKOWISKI_ID = 'bukowiski-thribus';

/**
 * Chat com colaborador (estilo Claude): agente único no topo, lateral com
 * pastas + sessões, botão "Nova sessão". Mensagem entra 'pending'; o daemon
 * do Claude Code responde via realtime.
 */
export function TalkPage() {
  const agents = useAppStore((s) => s.agents);
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
  const [activeId, setActiveId] = useState<string | null>(null);
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
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }, []);
  const spokenRef = useRef<string | null>(null);

  // ─── Skill de Voz ───────────────────────────────────────────────────────────
  const [voiceCfg, setVoiceCfg] = useState<VoiceConfig | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
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
    levelRef.current = 0; setPanelLevel(0);
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
    setActiveId((cur) => cur ?? sVisible.find((x) => !x.archivedAt)?.id ?? null);
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

  // Fala uma resposta: provider configurado (áudio) ou voz nativa do navegador.
  async function speakReply(text: string, onEnd?: () => void) {
    const cfg = voiceCfgRef.current;
    if (cfg?.enabled && cfg.provider !== 'browser' && agentId) {
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

  function onVoiceResult(text: string) {
    if (voiceModeRef.current) {
      // "off", "para", "chega", "tchau", "Bukowiski chega"… = desligar o modo voz.
      if (isStopPhrase(text)) { stopVoiceMode(); return; }
      if (waitingRef.current) return; // turn-based: espera a resposta
      send(text);
    } else setInput((cur) => (cur ? `${cur} ${text}` : text));
  }
  function startListenOnce() {
    if (!voice.sttSupported) return;
    // Marca o mic ocupado ANTES, pra o wake word soltar o microfone; aí inicia
    // (pequeno atraso = o reconhecedor do orbe libera o mic e não há conflito).
    setSttBusy(true);
    setTimeout(() => voice.startListening(onVoiceResult), 160);
  }
  function micToggle() {
    if (voice.listening) { voice.stopListening(); setSttBusy(false); }
    else startListenOnce();
  }
  function stopVoiceMode() {
    setVoiceMode(false);
    voiceModeRef.current = false;
    setVoiceModeActive(false);
    setSttBusy(false);
    voice.stopListening();
    voice.cancelSpeak();
    audioRef.current?.pause();
    setSpeakingProvider(false);
  }

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const waiting =
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user' &&
    ['pending', 'processing'].includes(messages[messages.length - 1].status);
  waitingRef.current = waiting;
  // mensagem do usuário em processamento → chave dos passos "por trás"
  const lastUserMsgId = waiting ? messages[messages.length - 1].id : null;

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
  const rootFolders = folders.filter((f) => !f.parentId);
  const childFolders = (pid: string) => folders.filter((f) => f.parentId === pid);

  const patchSession = (id: string, patch: Partial<ChatSession>) =>
    setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function toggleArchive(s: ChatSession) {
    try {
      const archivedAt = await setSessionArchived(s.id, !s.archivedAt);
      patchSession(s.id, { archivedAt });
      if (!s.archivedAt && activeId === s.id) setActiveId(liveSessions.find((x) => x.id !== s.id)?.id ?? null);
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
      setActiveId(copy.id);
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

  async function newSession(folderId: string | null = null) {
    if (!agentId || !userId) return;
    const s = await createSession(agentId, userId, { folderId });
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
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
    if (activeId === id) setActiveId(null);
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
              <SessionItem key={s.id} session={s} active={s.id === activeId} depth={depth + 1} onClick={() => setActiveId(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
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
            onClick={() => newFolder(null)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-default text-creme-mute text-[13px] hover:bg-surface-hover transition-colors"
          >
            <FolderPlus size={14} /> Nova pasta
          </button>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-2 space-y-0.5 transition-colors ${dragOverId === 'root' ? 'bg-brand/[0.06]' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverId('root'); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverId((c) => (c === 'root' ? null : c)); }}
          onDrop={(e) => { e.preventDefault(); dropOnTarget(null); }}
        >
          {rootFolders.map((f) => renderFolder(f, 0))}

          {/* Sessões sem pasta */}
          {ungrouped.length > 0 && (
            <div className="pt-1">
              {folders.length > 0 && (
                <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${dragOverId === 'root' ? 'text-brand' : 'text-creme-faint'}`}>Sem pasta</div>
              )}
              <div className="space-y-0.5">
                {ungrouped.map((s) => (
                  <SessionItem key={s.id} session={s} active={s.id === activeId} depth={0} onClick={() => setActiveId(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
                ))}
              </div>
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
                    <SessionItem key={s.id} session={s} active={s.id === activeId} depth={0} onClick={() => setActiveId(s.id)} onMenu={(pos) => setSessMenu({ id: s.id, ...pos })} onDragStartItem={() => { dragItemRef.current = { type: 'session', id: s.id }; }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Config & docs + skill de voz */}
        <div className="p-2 border-t border-default shrink-0 space-y-0.5">
          <button
            onClick={() => setInfoOpen(true)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-surface-hover transition-colors text-left"
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
            <button
              onClick={() => navigate('/settings')}
              title="Abrir configurações"
              className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[15px] font-bold text-white shrink-0 hover:ring-2 hover:ring-brand/50 transition-all cursor-pointer"
            >
              {agent.name[0]}
            </button>
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

          <div className="flex items-center gap-2 shrink-0">
            {/* Uso por sessão — histórico de tokens/custo/contexto */}
            <button
              onClick={() => setUsageOpen(true)}
              title="Uso por sessão — tokens, custo e contexto de cada conversa"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-default bg-surface-2 text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            >
              <BarChart3 size={16} />
            </button>

            {/* Modo voz — ícone na barra */}
            <button
              onClick={() => startPanelVoice()}
              title="Modo voz — conversa falando nesta conversa"
              className="w-9 h-9 flex items-center justify-center rounded-xl border bg-surface-2 border-default text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            >
              <Headphones size={16} />
            </button>

            {/* Trocar colaborador */}
            <div className="relative">
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
        </div>

        <div className="flex-1 relative overflow-hidden">
          {messages.length === 0 ? (
            /* Boas-vindas estilo CORTEX — esfera animada + saudação */
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {/* Esfera circular perfeita — efeitos contidos, borda esmaecida */}
              <div
                className="absolute aspect-square w-[min(82vmin,640px)] rounded-full overflow-hidden"
                style={{ WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)' }}
              >
                <NeuralSphere className="absolute inset-0" intensity={sphereIntensity} />
              </div>

              <div className="relative z-10 text-center px-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-bright/70 mb-2">{greeting}</div>
                <div className="text-[clamp(38px,6vw,60px)] font-bold tracking-tight text-creme leading-none mb-5">{firstName}</div>
                <div className="text-[13.5px] text-creme-mute">
                  {active ? `Mande a primeira mensagem para ${agent.name}.` : `Comece uma sessão com ${agent.name}.`}
                </div>
                {!active && (
                  <button onClick={() => newSession(null)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors">
                    <Plus size={15} /> Nova sessão
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-6 py-5 space-y-4">
              {messages.map((m, mi) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-md bg-brand text-white text-[15px] leading-[1.7]">
                      {m.attachments.length > 0 && <MessageAttachments items={m.attachments} />}
                      {m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
                      {m.status === 'error' && (
                        <div className="text-[11px] mt-1 text-white/80 flex items-center gap-2 flex-wrap">
                          <span>erro: {m.error}</span>
                          <button
                            onClick={() => send(m.content)}
                            disabled={sending}
                            className="underline underline-offset-2 hover:text-white disabled:opacity-50 shrink-0"
                          >
                            ↻ Reenviar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5 max-w-[90%]">
                    <div className="w-7 h-7 rounded-full bg-brand/15 text-brand-bright flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-creme-mute mb-1">{agent.name}</div>
                      <div className="px-4 py-2.5 rounded-2xl rounded-tl-md bg-surface-2 border border-default text-creme text-[15px] leading-[1.7]">
                        <Markdown text={m.content} />
                        {m.status === 'error' && <div className="text-[11px] mt-1 text-semantic-red">erro: {m.error}</div>}
                      </div>
                      <MessageSteps refId={[...messages.slice(0, mi)].reverse().find((x) => x.role === 'user')?.id ?? null} />
                    </div>
                  </div>
                ),
              )}
              {waiting && <ThinkingActivity agentName={agent.name} refId={lastUserMsgId} />}
            </div>
          )}
        </div>

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
          <div className="relative flex items-end gap-2.5 bg-surface-2 border border-default rounded-2xl px-3 py-2 focus-within:border-brand transition-colors">
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
                              {c.id === 'bukowiski-thribus' && <Crown size={12} className="text-brand-bright shrink-0" />}
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
            {voice.sttSupported && (
              <button
                onClick={micToggle}
                title={voice.listening ? 'Parar' : 'Falar (transcrever)'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${voice.listening ? 'bg-semantic-red/15 text-semantic-red animate-pulse' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}
              >
                <Mic size={17} />
              </button>
            )}
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
        </div>
      </div>

      {usageOpen && (
        <SessionUsageModal
          agentId={agent.id}
          agentName={agent.name}
          sessions={sessions}
          folders={folders}
          activeId={activeId}
          onClose={() => setUsageOpen(false)}
          onOpenSession={(id) => setActiveId(id)}
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

          {/* Esfera central + status — reage à voz (mic level) estilo CORTEX */}
          <div className="relative z-10 flex flex-col items-center gap-7">
            <div className="relative aspect-square w-[min(60vmin,540px)]">
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{ WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)' }}
              >
                <NeuralSphere className="absolute inset-0" intensity={panelVoiceState === 'speaking' ? 0.95 : panelVoiceState === 'thinking' ? 0.5 : 0.4 + panelLevel * 0.55} />
              </div>
              <div className="pointer-events-none absolute -inset-[7%] rounded-full ring-1 ring-brand/[0.07]" />
              <div className="pointer-events-none absolute -inset-[16%] rounded-full ring-1 ring-brand/[0.035]" />
            </div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.3em] text-brand-bright/70">
              {panelVoiceState === 'speaking' ? 'Respondendo…' : panelVoiceState === 'thinking' ? 'Pensando…' : panelVoiceState === 'talking' ? 'Você falando…' : 'Ouvindo…'}
            </div>
          </div>

          {/* Encerrar — botão claro */}
          <button
            onClick={stopPanelVoice}
            className="absolute bottom-10 z-10 px-5 py-2.5 rounded-full border border-default bg-surface-1/70 backdrop-blur text-[12px] font-semibold uppercase tracking-[0.2em] text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
          >
            Encerrar
          </button>
        </div>
      )}
    </div>
  );
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
