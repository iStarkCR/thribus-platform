/**
 * Motor de modo voz CONTÍNUO, em FILA e half-duplex.
 *
 * - Mic aberto o tempo todo, MAS ignorado enquanto o assistente fala (half-duplex)
 *   → o eco da própria voz / ruído durante o playback não vira turno falso, e a
 *   resposta SEMPRE termina (sem barge-in cortando).
 * - Cada fala finalizada é transcrita e entra numa FILA visível; a resposta de
 *   cada turno é gerada e falada em ORDEM (você pode emendar falas enquanto ele
 *   pensa — elas esperam a vez).
 * - VAD adaptativo, menos sensível, com silêncio mais longo (não corta no meio).
 */

// Logs de diagnóstico do VAD/voz — o da linha do RMS roda a cada frame de áudio
// (serializa string síncrona, trava a main thread com DevTools aberto). Liga só
// quando for depurar voz.
const VOICE_DEBUG = false;

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'processing' | 'playing';
export type VoiceTurn = { id: string; text: string; status: 'queued' | 'processing' | 'done' };

export interface VoiceControllerOpts {
  onState?: (s: VoiceState) => void;
  onLevel?: (rms: number) => void;          // energia do mic (entrada)
  onPlaybackLevel?: (rms: number) => void;  // energia do TTS tocando (saída)
  onTranscript?: (t: string) => void;       // o que o usuário falou
  onReply?: (t: string) => void;            // resposta do assistente
  onTurns?: (turns: VoiceTurn[]) => void;   // fila de turnos (pendente/processando)
  onError?: (e: Error) => void;
  /** Grava → texto (edge function transcribe). */
  transcribe: (blob: Blob, durationMs: number) => Promise<string>;
  /** Texto → áudio MP3 (edge function tts). null = sem áudio. */
  tts: (text: string) => Promise<Blob | null>;
  /** Manda a fala pro chat e resolve com a resposta (completa). */
  sendAndAwait: (text: string) => Promise<string>;
  /** Ack curto e contextual falado ANTES da resposta pesada (gap de "pensando"). */
  quickAck?: (text: string) => Promise<string>;
  /** Frase é "lixo" do Whisper (alucinação de silêncio)? */
  isNoise?: (t: string) => boolean;
}

const SILENCE_1S = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

// Tira markdown pra fala soar natural.
function cleanForSpeech(s: string): string {
  return (s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_#>~|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Extrai frases COMPLETAS de um texto acumulado; devolve o resto pendente.
function extractSentences(text: string): { sentences: string[]; remaining: string } {
  if (!text) return { sentences: [], remaining: '' };
  const sentences: string[] = [];
  const re = /[^.!?;:\n]+[.!?;:\n]+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s.length >= 10) { sentences.push(s); last = re.lastIndex; }
  }
  return { sentences, remaining: text.slice(last) };
}

export class VoiceController {
  private o: VoiceControllerOpts;
  private state: VoiceState = 'idle';
  private cancelled = false;

  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private persistentAudio: HTMLAudioElement | null = null;

  // captura contínua (um recorder por enunciado)
  private recorder: MediaRecorder | null = null;
  private curChunks: BlobPart[] = [];
  private rafId = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechActive = false;
  private recordStart = 0;
  private muted = false;
  private _above = 0;

  // fila de turnos (transcritos) + worker serial de resposta
  private turns: VoiceTurn[] = [];
  private replyQueue: { id: string; text: string }[] = [];
  private replyRunning = false;
  private turnSeq = 0;

  // fila de TTS (toca em sequência, em ordem dos turnos)
  private audioQueue: Promise<Blob | null>[] = [];
  private queueRunning = false;
  private playing = false;
  private playResolve: (() => void) | null = null;
  private playbackAnalyser: AnalyserNode | null = null;
  private playbackRaf = 0;

  // VAD adaptativo (média móvel do ruído).
  private noiseFloor = 0.025;
  private readonly ONSET_FRAMES = 5;      // ~80ms acima do limiar pra contar fala
  private readonly SILENCE_MS = 1500;     // silêncio pra encerrar a fala (não corta no meio)
  private readonly MIN_SPEECH_MS = 350;
  private readonly MAX_UTTERANCE_MS = 30000;
  private _vadLogAt = 0;

  constructor(opts: VoiceControllerOpts) { this.o = opts; }

  getState(): VoiceState { return this.state; }

  // Edita o texto de um turno AINDA na fila (antes de ser respondido).
  editTurn(id: string, text: string): void {
    const turn = this.turns.find((t) => t.id === id);
    if (!turn || turn.status !== 'queued') return;
    turn.text = text;
    const q = this.replyQueue.find((x) => x.id === id);
    if (q) q.text = text;
    this._emitTurns();
  }

  // Remove um turno AINDA na fila (não será respondido).
  removeTurn(id: string): void {
    const turn = this.turns.find((t) => t.id === id);
    if (!turn || turn.status !== 'queued') return;
    this.turns = this.turns.filter((t) => t.id !== id);
    this.replyQueue = this.replyQueue.filter((x) => x.id !== id);
    this._emitTurns();
    this._refreshState();
  }

  setMuted(b: boolean): void {
    this.muted = b;
    if (b) { this.speechActive = false; this._above = 0; if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; } this._resetRecorder(); }
    this._refreshState();
  }

  /**
   * Injeta um texto como se fosse um turno já transcrito — usado pela wake word
   * quando o comando veio junto do nome ("Bukowiski, me dá o status"): a frase
   * capturada pelo reconhecedor entra direto na fila, sem esperar nova fala.
   */
  injectText(text: string): void {
    const t = text.trim();
    if (!t || this.cancelled) return;
    this.o.onTranscript?.(t);
    const id = `t${++this.turnSeq}`;
    this.turns.push({ id, text: t, status: 'queued' });
    this._emitTurns();
    this._refreshState();
    this.replyQueue.push({ id, text: t });
    if (!this.replyRunning) void this._runReplies();
  }

  async start(): Promise<void> {
    this.cancelled = false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') { try { await this.audioCtx.resume(); } catch { /* noop */ } }
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.analyser);

      const a = new Audio();
      this.persistentAudio = a;
      // Analisador do PLAYBACK: roteia o áudio do TTS por um analyser pra esfera
      // pulsar com a voz dele de verdade. createMediaElementSource só pode 1x.
      try {
        const src = this.audioCtx.createMediaElementSource(a);
        this.playbackAnalyser = this.audioCtx.createAnalyser();
        this.playbackAnalyser.fftSize = 256;
        this.playbackAnalyser.smoothingTimeConstant = 0.6;
        src.connect(this.playbackAnalyser);
        this.playbackAnalyser.connect(this.audioCtx.destination);
      } catch { /* sem meter — áudio ainda toca normal */ }
      a.src = SILENCE_1S;
      a.play().catch(() => { /* noop */ });

      this._armRecorder();
      this._setState('listening');
      this._monitorVAD();
    } catch (e) {
      this.o.onError?.(e as Error);
      this.stop();
    }
  }

  stop(): void {
    this.cancelled = true;
    this._setState('idle');
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.playbackRaf) { cancelAnimationFrame(this.playbackRaf); this.playbackRaf = 0; }
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    try { this.recorder?.state !== 'inactive' && this.recorder?.stop(); } catch { /* noop */ }
    this.recorder = null;
    this.turns = []; this.replyQueue = []; this.replyRunning = false;
    this.o.onTurns?.([]);
    this.audioQueue = [];
    this.queueRunning = false;
    this.playing = false;
    this.playResolve?.(); this.playResolve = null;
    if (this.persistentAudio) { try { this.persistentAudio.pause(); } catch { /* noop */ } }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') this.audioCtx.close().catch(() => { /* noop */ });
    this.audioCtx = null;
  }

  private _setState(s: VoiceState): void {
    if (this.state === s) return;
    this.state = s;
    this.o.onState?.(s);
  }

  private _refreshState(): void {
    if (this.cancelled) return;
    if (this.speechActive) this._setState('speaking');
    else if (this.playing) this._setState('playing');
    else if (this.replyRunning || this.replyQueue.length > 0) this._setState('processing');
    else this._setState('listening');
  }

  private _emitTurns(): void { this.o.onTurns?.(this.turns.map((t) => ({ ...t }))); }

  // ─── Captura ────────────────────────────────────────────────────────────────
  private _armRecorder(): void {
    if (this.cancelled || !this.stream) return;
    const chunks: BlobPart[] = [];
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.start();
      this.recorder = rec;
      this.curChunks = chunks;
    } catch (e) { this.o.onError?.(e as Error); return; }
    this.recordStart = performance.now();
    this.speechActive = false;
    this._above = 0;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  // Para o recorder atual e arma um novo (descarta o que estava capturando — ex:
  // o eco do próprio playback). Sem sobrepor dois recorders no mesmo stream.
  private _resetRecorder(): void {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== 'inactive') { try { rec.onstop = () => this._armRecorder(); rec.stop(); } catch { this._armRecorder(); } }
    else this._armRecorder();
  }

  private _monitorVAD(): void {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (this.cancelled) return;
      // Half-duplex: enquanto ELE fala (ou mic pausado), ignora a entrada → sem
      // eco virando turno e sem cortar a resposta.
      if (this.muted || this.playing) { this.o.onLevel?.(0); this._above = 0; this.rafId = requestAnimationFrame(tick); return; }
      this.analyser!.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      this.o.onLevel?.(rms);
      const now = performance.now();
      // Pensando (ocupado) → limiar um pouco maior; ouvindo → base.
      const busy = this.replyRunning || this.replyQueue.length > 0;
      const base = Math.max(0.045, this.noiseFloor * 3);
      const threshold = busy ? Math.max(0.06, this.noiseFloor * 3.5) : base;
      const onset = busy ? 7 : this.ONSET_FRAMES;
      if (now - this._vadLogAt > 700) {
        this._vadLogAt = now;
        VOICE_DEBUG && console.log(`[voz] rms=${rms.toFixed(4)} piso=${this.noiseFloor.toFixed(4)} limiar=${threshold.toFixed(4)} fala=${this.speechActive} busy=${busy}`);
      }
      if (rms > threshold) {
        this._above++;
        if (!this.speechActive && this._above >= onset) { this.speechActive = true; this._refreshState(); }
        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      } else {
        this._above = 0;
        if (!this.speechActive) this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
        if (this.speechActive && !this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.silenceTimer = null;
            if (performance.now() - this.recordStart >= this.MIN_SPEECH_MS) this._finalizeUtterance();
          }, this.SILENCE_MS);
        }
      }
      if (this.speechActive && now - this.recordStart > this.MAX_UTTERANCE_MS) this._finalizeUtterance();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _finalizeUtterance(): void {
    if (this.cancelled) return;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    const hadSpeech = this.speechActive;
    const dur = performance.now() - this.recordStart;
    const rec = this.recorder;
    const chunks = this.curChunks;
    this.recorder = null;
    this.speechActive = false;
    if (!rec) { this._armRecorder(); return; }
    const finish = () => {
      const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null;
      this._armRecorder();
      this._refreshState();
      VOICE_DEBUG && console.log(`[voz] finaliza: hadSpeech=${hadSpeech} dur=${Math.round(dur)}ms blob=${blob?.size ?? 0}`);
      if (this.cancelled || !blob || !hadSpeech) return;
      void this._ingest(blob, dur);
    };
    try { rec.onstop = finish; rec.stop(); } catch { finish(); }
  }

  // Transcreve (paralelo) e empilha o turno na fila visível + worker serial.
  private async _ingest(blob: Blob, dur: number): Promise<void> {
    let text = '';
    try { text = (await this.o.transcribe(blob, dur)).trim(); } catch (e) { this.o.onError?.(e as Error); }
    VOICE_DEBUG && console.log(`[voz] transcrito: "${text}"`);
    if (this.cancelled || !text || this.o.isNoise?.(text)) return;
    this.o.onTranscript?.(text);
    const id = `t${++this.turnSeq}`;
    this.turns.push({ id, text, status: 'queued' });
    this._emitTurns();
    this._refreshState();
    this.replyQueue.push({ id, text });
    if (!this.replyRunning) void this._runReplies();
  }

  private async _runReplies(): Promise<void> {
    this.replyRunning = true;
    this._refreshState();
    while (this.replyQueue.length > 0 && !this.cancelled) {
      const { id, text } = this.replyQueue.shift()!;
      const turn = this.turns.find((t) => t.id === id);
      if (turn) { turn.status = 'processing'; this._emitTurns(); }
      try { await this._handleReply(text); } catch (e) { this.o.onError?.(e as Error); }
      // Mantém o turno como histórico ('done'); guarda os últimos 12.
      const t2 = this.turns.find((t) => t.id === id);
      if (t2) t2.status = 'done';
      if (this.turns.length > 12) this.turns = this.turns.slice(-12);
      this._emitTurns();
    }
    this.replyRunning = false;
    this._refreshState();
  }

  // ack curto (paralelo) + resposta pesada → frases → fila de TTS (em ordem).
  private async _handleReply(text: string): Promise<void> {
    const replyPromise = this.o.sendAndAwait(text);
    if (this.o.quickAck) {
      try {
        const ack = await this.o.quickAck(text);
        if (ack && !this.cancelled) { VOICE_DEBUG && console.log(`[voz] ack: "${ack}"`); this._enqueue(ack); }
      } catch { /* sem ack */ }
    }
    let reply = '';
    try { reply = await replyPromise; } catch (e) { this.o.onError?.(e as Error); }
    if (this.cancelled) return;
    this.o.onReply?.(reply);
    const clean = cleanForSpeech(reply);
    const { sentences, remaining } = extractSentences(clean + '\n');
    const all = [...sentences];
    if (remaining.trim().length >= 3) all.push(remaining.trim());
    VOICE_DEBUG && console.log(`[voz] resposta: ${reply.length} chars, ${all.length} frase(s) p/ TTS`);
    for (const s of all) this._enqueue(s);
    // espera o TTS deste turno escoar antes de processar o próximo (fala em ordem).
    await this._waitQueue();
  }

  private _enqueue(sentence: string): void {
    const p = this.o.tts(sentence)
      .then((b) => { VOICE_DEBUG && console.log(`[voz] tts "${sentence.slice(0, 24)}…" → ${b?.size ?? 0} bytes`); return b; })
      .catch((e) => { VOICE_DEBUG && console.log(`[voz] tts ERRO: ${(e as Error).message}`); return null; });
    this.audioQueue.push(p);
    if (!this.queueRunning) void this._drainQueue();
  }

  // Mede a energia do TTS tocando e emite (esfera reage à voz dele).
  private _startPlaybackMeter(): void {
    if (!this.playbackAnalyser || this.playbackRaf) return;
    const buf = new Uint8Array(this.playbackAnalyser.fftSize);
    const tick = () => {
      if (this.cancelled || !this.playing || !this.playbackAnalyser) { this.playbackRaf = 0; this.o.onPlaybackLevel?.(0); return; }
      this.playbackAnalyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      this.o.onPlaybackLevel?.(Math.sqrt(sum / buf.length));
      this.playbackRaf = requestAnimationFrame(tick);
    };
    this.playbackRaf = requestAnimationFrame(tick);
  }

  private async _drainQueue(): Promise<void> {
    this.queueRunning = true;
    this.playing = true;
    this._refreshState();
    this._startPlaybackMeter();
    while (this.audioQueue.length > 0 && !this.cancelled) {
      const blob = await this.audioQueue.shift()!;
      if (!blob || this.cancelled) continue;
      await this._play(blob);
    }
    this.queueRunning = false;
    this.playing = false;
    this._resetRecorder(); // descarta o eco captado durante a fala
    this._refreshState();
  }

  private _waitQueue(): Promise<void> {
    return new Promise((res) => {
      const check = () => {
        if (this.cancelled || (this.audioQueue.length === 0 && !this.queueRunning)) res();
        else setTimeout(check, 120);
      };
      check();
    });
  }

  private _play(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = this.persistentAudio ?? new Audio();
      audio.src = url;
      audio.muted = false;
      this.playing = true;
      this._refreshState();
      VOICE_DEBUG && console.log(`[voz] tocando áudio (${blob.size} bytes)`);
      let done = false;
      const finish = () => { if (done) return; done = true; URL.revokeObjectURL(url); this.playResolve = null; resolve(); };
      this.playResolve = finish;
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch((e) => { VOICE_DEBUG && console.log(`[voz] play bloqueado: ${(e as Error).message}`); this.o.onError?.(new Error('Áudio bloqueado pelo navegador. Clique na esfera de novo.')); finish(); });
    });
  }
}
