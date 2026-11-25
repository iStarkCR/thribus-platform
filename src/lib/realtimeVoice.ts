/**
 * Modo voz em TEMPO REAL — OpenAI Realtime (gpt-realtime) via WebRTC como camada
 * de voz, Bukowiski (Claude na ponte) como cérebro.
 *
 * - Fala ↔ fala direto com a OpenAI: VAD semântico, interrupção nativa (falar por
 *   cima corta a resposta), resposta conversacional em < 1s.
 * - Pedido que precisa de dado/ação/sistema → tool `perguntar_bukowiski`: vira
 *   mensagem is_voice na conversa ativa, a ponte roda o Claude, e o resultado
 *   volta como function_call_output pro modelo resumir em voz. Enquanto o Claude
 *   trabalha, a conversa segue (dá pra emendar outros pedidos).
 * - Transcrições dos dois lados ficam gravadas no chat ('done', não disparam a ponte).
 *
 * Mesma interface de callbacks/estados do VoiceController (o overlay do painel
 * é o mesmo pros dois motores).
 */

import { createRealtimeSession, OPENAI_REALTIME_CALLS_URL } from '@/services/realtime';
import { sendMessage, saveVoiceTranscript, waitForReply, type ChatMessage } from '@/services/collaboratorChat';
import type { VoiceState, VoiceTurn } from '@/lib/voiceMode';

const TOOL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TOOL_OUTPUT = 6000;

export interface RealtimeVoiceOpts {
  agentId: string;
  userId: string;
  instructions: string;
  voice?: string;
  /** Sessão de chat onde a conversa é gravada (cria se não houver). */
  ensureSessionId: () => Promise<string | null>;
  onState?: (s: VoiceState) => void;
  onLevel?: (rms: number) => void;
  onPlaybackLevel?: (rms: number) => void;
  onTurns?: (turns: VoiceTurn[]) => void;
  /** Legenda ao vivo: o que o usuário disse / o que o assistente está falando. */
  onCaption?: (c: { role: 'user' | 'assistant'; text: string }) => void;
  onError?: (e: Error) => void;
  /** Sessão terminou sozinha (pedido de encerrar, queda de conexão). */
  onEnd?: () => void;
}

type ServerEvent = { type: string; [k: string]: unknown };
type FunctionCallItem = { type: 'function_call'; name: string; call_id: string; arguments: string };

// Resposta do Claude → texto enxuto pro modelo de voz resumir (sem código/blocos da ponte).
function toolOutputText(s: string): string {
  return (s || '')
    .replace(/```[\s\S]*?```/g, ' [bloco omitido] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TOOL_OUTPUT);
}

export function buildRealtimeInstructions(p: {
  userName: string;
  context: Pick<ChatMessage, 'role' | 'content'>[];
}): string {
  const lines = p.context
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .slice(-16)
    .map((m) => `${m.role === 'user' ? p.userName : 'Bukowiski'}: ${m.content.replace(/```[\s\S]*?```/g, '[bloco]').replace(/\s+/g, ' ').slice(0, 700)}`);
  return [
    `Você é o Bukowiski, COO da Thribus Tech, numa LIGAÇÃO de voz com ${p.userName}.`,
    'Fale português do Brasil, natural e falado: frases curtas, sem markdown, sem listas, sem ler URLs ou código.',
    'Tom: confiante, caloroso, direto, como um COO afiado e próximo. Pronúncia: "Bukowiski" = "Bukóviski", "Thribus" = "Tríbus".',
    '',
    'CONVERSE DE VERDADE: responda você mesmo, na hora — opinião, estratégia, brainstorm, explicações, dúvidas, decisões,',
    'conhecimento geral e tudo que já está no contexto abaixo. Reaja ao que ele diz, faça perguntas, construa a conversa junto.',
    '',
    'Use perguntar_bukowiski SÓ quando a resposta depender de: dado ao vivo dos sistemas (VPS, banco, clientes, financeiro,',
    'agenda, e-mail, código do repositório), memória de conversas antigas que NÃO está no contexto, ou executar uma ação',
    '(criar, enviar, alterar, deployar). Nesses casos, avise em uma frase natural e específica ao pedido — nunca uma frase genérica',
    'repetida — e siga conversando enquanto a tarefa roda. NUNCA invente dados, números ou status.',
    'Quando o resultado chegar, conte em 2 a 4 frases o essencial, como numa conversa, e ofereça detalhar. Erro ou timeout: diga com honestidade.',
    'Se ele pedir para parar, sair ou encerrar a conversa por voz, chame encerrar_voz.',
    ...(lines.length ? ['', 'Contexto recente da conversa no chat:', ...lines] : []),
  ].join('\n');
}

export class RealtimeVoice {
  private o: RealtimeVoiceOpts;
  private cancelled = false;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private rafId = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private userSpeaking = false;
  private playing = false;
  private responseActive = false;
  private responsePending = false;
  private endRequested = false;
  private handledCalls = new Set<string>();
  private abort = new AbortController();
  private turns: VoiceTurn[] = [];
  private state: VoiceState = 'idle';
  private captionResp = '';
  private captionText = '';

  constructor(opts: RealtimeVoiceOpts) { this.o = opts; }

  async start(): Promise<void> {
    this.cancelled = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone indisponível neste navegador.');
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.cancelled) return this._teardown();

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume().catch(() => {});
      this.micAnalyser = this.audioCtx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      this.micAnalyser.smoothingTimeConstant = 0.6;
      this.audioCtx.createMediaStreamSource(this.mic).connect(this.micAnalyser);

      // Criado no gesto do clique (autoplay); o stream remoto entra no ontrack.
      this.audioEl = new Audio();
      this.audioEl.autoplay = true;

      const session = await createRealtimeSession({ voice: this.o.voice ?? 'ash', instructions: this.o.instructions });
      if (this.cancelled) return this._teardown();

      const pc = new RTCPeerConnection();
      this.pc = pc;
      pc.ontrack = (e) => {
        const remote = e.streams[0];
        if (this.audioEl) { this.audioEl.srcObject = remote; void this.audioEl.play().catch(() => {}); }
        if (this.audioCtx && remote) {
          this.outAnalyser = this.audioCtx.createAnalyser();
          this.outAnalyser.fftSize = 256;
          this.outAnalyser.smoothingTimeConstant = 0.6;
          this.audioCtx.createMediaStreamSource(remote).connect(this.outAnalyser); // só mede; quem toca é o <audio>
        }
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected' && this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; }
        if (st === 'failed' || st === 'closed') this._fail(new Error(`Conexão de voz ${st === 'failed' ? 'falhou' : 'fechada'}.`));
        // 'disconnected' costuma se recuperar sozinho — só derruba se persistir.
        if (st === 'disconnected' && !this.disconnectTimer) {
          this.disconnectTimer = setTimeout(() => {
            this.disconnectTimer = null;
            if (pc.connectionState === 'disconnected') this._fail(new Error('Conexão de voz caiu.'));
          }, 6000);
        }
      };

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (ev) => {
        try { this._onEvent(JSON.parse(ev.data) as ServerEvent); } catch { /* evento malformado */ }
      };
      this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic!));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await fetch(`${OPENAI_REALTIME_CALLS_URL}?model=${encodeURIComponent(session.model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.value}`, 'Content-Type': 'application/sdp' },
      });
      if (!r.ok) throw new Error(`Realtime SDP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
      const answer = await r.text();
      if (this.cancelled) return this._teardown();
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });

      this._setState('listening');
      this._meter();
    } catch (e) {
      this._teardown();
      throw e;
    }
  }

  stop(): void {
    this.cancelled = true;
    this._teardown();
  }

  setMuted(b: boolean): void {
    this.mic?.getAudioTracks().forEach((t) => { t.enabled = !b; });
  }

  /**
   * Tarefa disparada pelo painel (ex.: briefing do dia): anuncia em voz, roda no
   * Claude por trás como mensagem NORMAL (resposta estruturada no chat) e, quando
   * chega, fala o essencial. `onSent` recebe a conversa onde a tarefa foi gravada.
   */
  async runTask(t: { label: string; pedido: string; announce: string; speak: string; onSent?: (sid: string) => void }): Promise<void> {
    await this._channelOpen();
    if (this.cancelled) return;
    if (!this.responseActive) this._send({ type: 'response.create', response: { instructions: t.announce } });

    const turn: VoiceTurn = { id: `task-${Date.now()}`, text: t.label, status: 'processing' };
    this.turns = [...this.turns, turn].slice(-12);
    this._emitTurns();
    this._refreshState();

    let note: string;
    try {
      const sid = await this.o.ensureSessionId();
      if (!sid) throw new Error('sem conversa ativa');
      const sent = await sendMessage(sid, this.o.agentId, this.o.userId, t.pedido);
      t.onSent?.(sid);
      const res = await waitForReply(sent, { timeoutMs: TOOL_TIMEOUT_MS, signal: this.abort.signal });
      if (res.kind === 'done') note = `${t.speak}\n\n${toolOutputText(res.content)}`;
      else if (res.kind === 'error') note = `A tarefa "${t.label}" deu erro (${res.error.slice(0, 300)}). Diga isso com honestidade, em uma frase.`;
      else if (res.kind === 'cancelled') note = `A tarefa "${t.label}" foi cancelada. Avise em uma frase.`;
      else note = `"${t.label}" ainda está sendo montado. Diga em uma frase que vai aparecer no chat quando terminar.`;
    } catch (e) {
      note = `Não deu pra rodar "${t.label}" (${(e as Error).message}). Diga isso em uma frase.`;
    }
    if (this.cancelled) return;
    turn.status = 'done';
    this._emitTurns();
    this._send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: note }] } });
    this.responsePending = true;
    this._flushResponse();
    this._refreshState();
  }

  private _channelOpen(): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState === 'open') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { dc.removeEventListener('open', done); dc.removeEventListener('close', done); resolve(); };
      dc.addEventListener('open', done);
      dc.addEventListener('close', done);
    });
  }

  // Turnos aqui são tarefas já delegadas ao Claude — não há fila editável.
  editTurn(): void { /* noop */ }
  removeTurn(): void { /* noop */ }

  // ─── Eventos do servidor ─────────────────────────────────────────────────────
  private _onEvent(evt: ServerEvent): void {
    if (this.cancelled) return;
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        this.userSpeaking = true; break;
      case 'input_audio_buffer.speech_stopped':
        this.userSpeaking = false; break;
      case 'output_audio_buffer.started':
        this.playing = true; break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.playing = false;
        if (this.endRequested) { this._end(); return; }
        break;
      case 'response.created':
        this.responseActive = true;
        this.responsePending = false; // a nova resposta já enxerga os outputs de tool enviados
        break;
      case 'response.done':
        this.responseActive = false;
        this._onResponseDone(evt);
        this._flushResponse();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const t = String(evt.transcript ?? '');
        if (t.trim()) this.o.onCaption?.({ role: 'user', text: t.trim() });
        this._persist('user', t);
        break;
      }
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const rid = String(evt.response_id ?? '');
        if (rid !== this.captionResp) { this.captionResp = rid; this.captionText = ''; }
        this.captionText += String(evt.delta ?? '');
        this.o.onCaption?.({ role: 'assistant', text: this.captionText });
        return;
      }
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        this._persist('assistant', String(evt.transcript ?? ''));
        break;
      case 'error': {
        const err = (evt.error ?? {}) as { message?: string; code?: string };
        // Corrida benigna: response.create com outra resposta ativa → tenta no próximo done.
        if (err.code === 'conversation_already_has_active_response') { this.responsePending = true; break; }
        this.o.onError?.(new Error(`Realtime: ${err.message ?? 'erro'}`));
        break;
      }
      default:
        return;
    }
    this._refreshState();
  }

  private _onResponseDone(evt: ServerEvent): void {
    const output = ((evt.response as { output?: unknown[] } | undefined)?.output ?? []) as Array<{ type?: string }>;
    for (const item of output) {
      if (item.type !== 'function_call') continue;
      const call = item as FunctionCallItem;
      if (this.handledCalls.has(call.call_id)) continue;
      this.handledCalls.add(call.call_id);
      if (call.name === 'encerrar_voz') {
        this.endRequested = true;
        this._toolOutput(call.call_id, { ok: true, instrucao: 'Despeça-se em uma frase curta.' });
        setTimeout(() => this._end(), 6000); // caso o áudio de despedida não venha
      } else if (call.name === 'perguntar_bukowiski') {
        let pedido = '';
        try { pedido = String((JSON.parse(call.arguments || '{}') as { pedido?: string }).pedido ?? ''); } catch { /* args inválidos */ }
        void this._delegate(call.call_id, pedido);
      } else {
        this._toolOutput(call.call_id, { erro: `ferramenta desconhecida: ${call.name}` });
      }
    }
  }

  private async _delegate(callId: string, pedido: string): Promise<void> {
    if (!pedido.trim()) { this._toolOutput(callId, { erro: 'pedido vazio' }); return; }
    const turn: VoiceTurn = { id: callId, text: pedido, status: 'processing' };
    this.turns = [...this.turns, turn].slice(-12);
    this._emitTurns();
    this._refreshState();
    let output: Record<string, unknown>;
    try {
      const sid = await this.o.ensureSessionId();
      if (!sid) throw new Error('sem conversa ativa');
      const sent = await sendMessage(sid, this.o.agentId, this.o.userId, pedido, undefined, true);
      const res = await waitForReply(sent, { timeoutMs: TOOL_TIMEOUT_MS, signal: this.abort.signal });
      if (res.kind === 'done') output = { resposta: toolOutputText(res.content) || '(resposta vazia)' };
      else if (res.kind === 'error') output = { erro: res.error.slice(0, 500) };
      else if (res.kind === 'cancelled') output = { erro: 'tarefa cancelada' };
      else output = { pendente: 'Ainda processando. O resultado vai aparecer no chat quando terminar.' };
    } catch (e) {
      output = { erro: (e as Error).message };
    }
    if (this.cancelled) return;
    turn.status = 'done';
    this._emitTurns();
    this._toolOutput(callId, output);
  }

  private _toolOutput(callId: string, output: Record<string, unknown>): void {
    this._send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    this.responsePending = true;
    this._flushResponse();
  }

  // Pede resposta só quando não há outra em curso e o usuário não está falando
  // (aí o próprio VAD cria a resposta, já vendo o output da tool).
  private _flushResponse(): void {
    if (!this.responsePending || this.responseActive || this.userSpeaking) return;
    this.responsePending = false;
    this._send({ type: 'response.create' });
  }

  private _send(evt: Record<string, unknown>): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(evt));
  }

  private _persist(role: 'user' | 'assistant', text: string): void {
    if (!text.trim()) return;
    void this.o.ensureSessionId()
      .then((sid) => (sid ? saveVoiceTranscript(sid, this.o.agentId, this.o.userId, role, text) : undefined))
      .catch((e) => this.o.onError?.(new Error(`Falha ao gravar fala: ${(e as Error).message}`)));
  }

  // ─── Estado / medidores ──────────────────────────────────────────────────────
  private _refreshState(): void {
    if (this.cancelled) return;
    const toolsRunning = this.turns.some((t) => t.status === 'processing');
    if (this.userSpeaking) this._setState('speaking');
    else if (this.playing) this._setState('playing');
    else if (this.responseActive || toolsRunning) this._setState('processing');
    else this._setState('listening');
  }

  private _setState(s: VoiceState): void {
    if (this.state === s) return;
    this.state = s;
    this.o.onState?.(s);
  }

  private _emitTurns(): void { this.o.onTurns?.(this.turns.map((t) => ({ ...t }))); }

  private _meter(): void {
    const micBuf = new Uint8Array(1024);
    const outBuf = new Uint8Array(256);
    const rms = (a: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      return Math.sqrt(sum / buf.length);
    };
    const tick = () => {
      if (this.cancelled) return;
      if (this.micAnalyser) this.o.onLevel?.(this.mic?.getAudioTracks()[0]?.enabled === false ? 0 : rms(this.micAnalyser, micBuf));
      if (this.outAnalyser) this.o.onPlaybackLevel?.(this.playing ? rms(this.outAnalyser, outBuf) : 0);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _end(): void {
    if (this.cancelled) return;
    this.stop();
    this.o.onEnd?.();
  }

  private _fail(e: Error): void {
    if (this.cancelled) return;
    this.o.onError?.(e);
    this._end();
  }

  private _teardown(): void {
    this.abort.abort();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; }
    try { this.dc?.close(); } catch { /* noop */ }
    this.dc = null;
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.close(); }
    this.pc = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.srcObject = null; }
    this.audioEl = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') this.audioCtx.close().catch(() => {});
    this.audioCtx = null;
    this.micAnalyser = null;
    this.outAnalyser = null;
    this.turns = [];
    this.o.onTurns?.([]);
    this.state = 'idle';
    this.o.onState?.('idle');
  }
}
