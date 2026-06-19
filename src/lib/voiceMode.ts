/**
 * Motor de modo voz contínuo — portado do VoiceModeController do CORTEX.
 *
 * Abre o microfone UMA vez e o mantém aberto o modo voz inteiro (sem ligar/
 * desligar por turno → sem conflito de mic, sem perder o início da fala). Um
 * AnalyserNode mede a energia (RMS) pra detectar fala/silêncio. Ao fim da fala,
 * transcreve (Whisper), manda pro chat, quebra a resposta em frases e toca o
 * TTS numa fila — começando a falar antes da resposta inteira chegar. Depois
 * volta a ouvir (loop). O áudio é destravado no gesto do start() (autoplay).
 */

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'processing' | 'playing';

export interface VoiceControllerOpts {
  onState?: (s: VoiceState) => void;
  onLevel?: (rms: number) => void;          // energia do mic (entrada)
  onPlaybackLevel?: (rms: number) => void;  // energia do TTS (saída)
  onTranscript?: (t: string) => void;       // o que o usuário falou
  onReply?: (t: string) => void;            // resposta do assistente
  onError?: (e: Error) => void;
  /** Grava → texto (edge function transcribe). */
  transcribe: (blob: Blob, durationMs: number) => Promise<string>;
  /** Texto → áudio MP3 (edge function tts). null = sem áudio. */
  tts: (text: string) => Promise<Blob | null>;
  /** Manda a fala pro chat e resolve com a resposta (completa). */
  sendAndAwait: (text: string) => Promise<string>;
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
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private persistentAudio: HTMLAudioElement | null = null;

  private rafId = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechActive = false;
  private recordStart = 0;

  // fila de TTS (toca em sequência, gera em paralelo)
  private audioQueue: Promise<Blob | null>[] = [];
  private queueRunning = false;

  private readonly SPEECH_THRESHOLD = 0.04;
  private readonly SILENCE_MS = 1200;
  private readonly MIN_SPEECH_MS = 400;
  private readonly MAX_UTTERANCE_MS = 25000;

  constructor(opts: VoiceControllerOpts) { this.o = opts; }

  getState(): VoiceState { return this.state; }

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

      // destrava autoplay dentro do gesto do start()
      const a = new Audio();
      a.src = SILENCE_1S;
      a.play().catch(() => { /* noop */ });
      this.persistentAudio = a;

      this._beginListening();
    } catch (e) {
      this.o.onError?.(e as Error);
      this.stop();
    }
  }

  stop(): void {
    this.cancelled = true;
    this._setState('idle');
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    try { this.recorder?.state !== 'inactive' && this.recorder?.stop(); } catch { /* noop */ }
    this.recorder = null;
    this.audioQueue = [];
    this.queueRunning = false;
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

  // ─── Escuta: grava + monitora energia ──────────────────────────────────────
  private _beginListening(): void {
    if (this.cancelled || !this.stream) return;
    this.chunks = [];
    this.speechActive = false;
    this.recordStart = performance.now();
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
      this.recorder.start();
    } catch (e) { this.o.onError?.(e as Error); return; }
    this._setState('listening');
    this._monitorVAD();
  }

  private _monitorVAD(): void {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (this.cancelled || (this.state !== 'listening' && this.state !== 'speaking')) return;
      this.analyser!.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      this.o.onLevel?.(rms);
      const now = performance.now();
      if (rms > this.SPEECH_THRESHOLD) {
        if (!this.speechActive) { this.speechActive = true; this._setState('speaking'); }
        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      } else if (this.speechActive && !this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          if (performance.now() - this.recordStart >= this.MIN_SPEECH_MS) this._finalizeUtterance();
        }, this.SILENCE_MS);
      }
      if (now - this.recordStart > this.MAX_UTTERANCE_MS && this.speechActive) { this._finalizeUtterance(); return; }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private async _finalizeUtterance(): Promise<void> {
    if (this.cancelled) return;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    const dur = performance.now() - this.recordStart;
    const rec = this.recorder;
    this.recorder = null;
    const chunks = this.chunks;
    this.chunks = [];

    const stopped = new Promise<void>((res) => { if (rec && rec.state !== 'inactive') { rec.onstop = () => res(); rec.stop(); } else res(); });
    await stopped;
    if (this.cancelled || chunks.length === 0) { if (!this.cancelled) this._beginListening(); return; }

    this._setState('processing');
    try {
      const blob = new Blob(chunks, { type: rec?.mimeType || 'audio/webm' });
      const text = (await this.o.transcribe(blob, dur)).trim();
      if (this.cancelled) return;
      if (!text || this.o.isNoise?.(text)) { this._beginListening(); return; } // sem fala de verdade → re-ouve
      this.o.onTranscript?.(text);
      await this._handleReply(text);
    } catch (e) {
      this.o.onError?.(e as Error);
      if (!this.cancelled) this._beginListening();
    }
  }

  // ─── Resposta: chat → frases → fila de TTS ─────────────────────────────────
  private async _handleReply(text: string): Promise<void> {
    let reply = '';
    try { reply = await this.o.sendAndAwait(text); } catch (e) { this.o.onError?.(e as Error); }
    if (this.cancelled) return;
    this.o.onReply?.(reply);
    const clean = cleanForSpeech(reply);
    const { sentences, remaining } = extractSentences(clean + '\n');
    const all = [...sentences];
    if (remaining.trim().length >= 3) all.push(remaining.trim());
    for (const s of all) this._enqueue(s);
    await this._waitQueue();
    if (!this.cancelled) this._beginListening();
  }

  private _enqueue(sentence: string): void {
    const p = this.o.tts(sentence).catch(() => null);
    this.audioQueue.push(p);
    if (!this.queueRunning) this._drainQueue();
  }

  private async _drainQueue(): Promise<void> {
    this.queueRunning = true;
    while (this.audioQueue.length > 0 && !this.cancelled) {
      const blob = await this.audioQueue.shift()!;
      if (!blob || this.cancelled) continue;
      await this._play(blob);
    }
    this.queueRunning = false;
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
      this._setState('playing');
      const done = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(() => { this.o.onError?.(new Error('Áudio bloqueado pelo navegador. Clique na esfera de novo.')); done(); });
    });
  }
}
