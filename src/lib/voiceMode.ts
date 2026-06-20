/**
 * Motor de modo voz CONTÍNUO e NÃO-BLOQUEANTE (full-duplex leve).
 *
 * - Mic aberto o tempo todo; o VAD nunca pausa (ouve durante o "pensando" e
 *   enquanto o assistente fala).
 * - BARGE-IN: se você começa a falar enquanto ele responde, a fala dele é
 *   cortada na hora e sua nova fala assume.
 * - NÃO-BLOQUEANTE: cada fala finalizada é DESPACHADA numa fila por trás
 *   (transcreve → ack → resposta → TTS). O loop de escuta não espera a resposta,
 *   então você pode continuar falando / pedir uma execução e seguir conversando.
 * - Anti-eco: durante o playback o limiar de fala sobe (só corta com fala clara)
 *   e o piso de ruído não é atualizado (não conta a voz dele).
 */

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'processing' | 'playing';

export interface VoiceControllerOpts {
  onState?: (s: VoiceState) => void;
  onLevel?: (rms: number) => void;          // energia do mic (entrada)
  onTranscript?: (t: string) => void;       // o que o usuário falou
  onReply?: (t: string) => void;            // resposta do assistente
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

  // captura contínua (um recorder por enunciado, re-armado sem gap)
  private recorder: MediaRecorder | null = null;
  private curChunks: BlobPart[] = [];
  private rafId = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private speechActive = false;
  private recordStart = 0;

  // fila de DESPACHO (transcreve→responde) — serial, roda por trás
  private dispatchQueue: { blob: Blob; dur: number }[] = [];
  private dispatchRunning = false;

  // fila de TTS (toca em sequência) + estado de playback (pra barge-in)
  private audioQueue: Promise<Blob | null>[] = [];
  private queueRunning = false;
  private playing = false;
  private curAudio: HTMLAudioElement | null = null;
  private playResolve: (() => void) | null = null;

  // VAD adaptativo: limiar RELATIVO ao ruído de fundo (média móvel).
  private noiseFloor = 0.02;
  private muted = false; // mic pausado pelo usuário (não escuta, sessão segue viva)
  private _above = 0; // frames seguidos acima do limiar (debounce do início da fala)
  private readonly ONSET_FRAMES = 4; // ~65ms — ignora estalo/clique/eco curto
  private readonly SILENCE_MS = 1100;
  private readonly MIN_SPEECH_MS = 350;
  private readonly MAX_UTTERANCE_MS = 30000;
  private _vadLogAt = 0;

  constructor(opts: VoiceControllerOpts) { this.o = opts; }

  getState(): VoiceState { return this.state; }

  // Mic pausado: não escuta (nem barge-in nem nova fala) mas a sessão segue viva.
  setMuted(b: boolean): void {
    this.muted = b;
    if (b) {
      this.speechActive = false;
      this._above = 0;
      if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      try { this.recorder?.state !== 'inactive' && this.recorder?.stop(); } catch { /* noop */ }
      this._armRecorder(); // descarta o que estava capturando
      this._refreshState();
    }
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

      // destrava autoplay dentro do gesto do start()
      const a = new Audio();
      a.src = SILENCE_1S;
      a.play().catch(() => { /* noop */ });
      this.persistentAudio = a;

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
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    try { this.recorder?.state !== 'inactive' && this.recorder?.stop(); } catch { /* noop */ }
    this.recorder = null;
    this.dispatchQueue = [];
    this.dispatchRunning = false;
    this.audioQueue = [];
    this.queueRunning = false;
    this.playing = false;
    this.playResolve?.(); this.playResolve = null;
    if (this.persistentAudio) { try { this.persistentAudio.pause(); } catch { /* noop */ } }
    this.curAudio = null;
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

  // Estado de UI derivado: falando > tocando > pensando > ouvindo.
  private _refreshState(): void {
    if (this.cancelled) return;
    if (this.speechActive) this._setState('speaking');
    else if (this.playing) this._setState('playing');
    else if (this.dispatchRunning || this.dispatchQueue.length > 0) this._setState('processing');
    else this._setState('listening');
  }

  // ─── Captura contínua ───────────────────────────────────────────────────────
  // Cada recorder tem o SEU array de chunks (closure) — re-armar não rouba o áudio
  // do anterior (o ondataavailable do sem-timeslice só dispara no stop()).
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
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private _monitorVAD(): void {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (this.cancelled) return;
      if (this.muted) { this.o.onLevel?.(0); this.rafId = requestAnimationFrame(tick); return; }
      this.analyser!.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      this.o.onLevel?.(rms);
      const now = performance.now();
      // Sensibilidade por contexto:
      //  • FALANDO (playing): eco da própria voz pode vazar → barge-in só com fala
      //    ALTA e sustentada (~230ms). Senão a resposta era cortada e nunca completava.
      //  • PENSANDO (busy): limiar alto, ruído não vira turno falso.
      //  • OUVINDO: limiar base normal.
      const busy = this.dispatchRunning || this.dispatchQueue.length > 0;
      const base = Math.max(0.035, this.noiseFloor * 2.8);
      const threshold = this.playing ? Math.max(0.18, this.noiseFloor * 6)
        : busy ? Math.max(0.13, this.noiseFloor * 5)
        : base;
      const onset = this.playing ? 14 : busy ? 8 : this.ONSET_FRAMES; // ~230 / 130 / 65ms
      if (now - this._vadLogAt > 700) {
        this._vadLogAt = now;
        console.log(`[voz] rms=${rms.toFixed(4)} piso=${this.noiseFloor.toFixed(4)} limiar=${threshold.toFixed(4)} fala=${this.speechActive} busy=${busy}`);
      }
      if (rms > threshold) {
        // Só conta como fala após N frames seguidos acima do limiar (debounce).
        this._above++;
        if (!this.speechActive && this._above >= onset) {
          this.speechActive = true;
          this._onSpeechStart();
        }
        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      } else {
        this._above = 0;
        // Piso de ruído só acompanha o ambiente quando NÃO há fala nem playback
        // (senão a voz do próprio assistente inflaria o piso).
        if (!this.speechActive && !this.playing) this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
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

  // Usuário começou a falar → BARGE-IN: corta a fala atual e limpa a fila de TTS.
  private _onSpeechStart(): void {
    if (this.playing || this.audioQueue.length > 0) this._stopPlayback();
    this._refreshState();
  }

  // Fecha o enunciado (sempre após silêncio → re-armar no onstop não perde fala),
  // re-arma a captura e despacha o áudio por trás (não bloqueia a escuta).
  private _finalizeUtterance(): void {
    if (this.cancelled) return;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    const hadSpeech = this.speechActive;
    const dur = performance.now() - this.recordStart;
    const rec = this.recorder;
    const chunks = this.curChunks;
    this.recorder = null;
    this.speechActive = false; // não re-dispara enquanto fecha
    if (!rec) { this._armRecorder(); return; }
    const finish = () => {
      const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null;
      this._armRecorder(); // volta a capturar
      this._refreshState();
      console.log(`[voz] finaliza: hadSpeech=${hadSpeech} dur=${Math.round(dur)}ms blob=${blob?.size ?? 0}`);
      if (this.cancelled || !blob || !hadSpeech) return; // ruído/sem fala → ignora
      this.dispatchQueue.push({ blob, dur });
      this._refreshState();
      if (!this.dispatchRunning) void this._runDispatch();
    };
    try { rec.onstop = finish; rec.stop(); } catch { finish(); }
  }

  // ─── Despacho serial (por trás) ─────────────────────────────────────────────
  private async _runDispatch(): Promise<void> {
    this.dispatchRunning = true;
    this._refreshState();
    while (this.dispatchQueue.length > 0 && !this.cancelled) {
      const { blob, dur } = this.dispatchQueue.shift()!;
      try {
        const text = (await this.o.transcribe(blob, dur)).trim();
        console.log(`[voz] transcrito: "${text}"`);
        if (this.cancelled) break;
        if (!text || this.o.isNoise?.(text)) continue;
        this.o.onTranscript?.(text);
        await this._handleReply(text);
      } catch (e) { this.o.onError?.(e as Error); }
    }
    this.dispatchRunning = false;
    this._refreshState();
  }

  // Resposta: ack curto (paralelo) + resposta pesada → frases → fila de TTS.
  private async _handleReply(text: string): Promise<void> {
    const replyPromise = this.o.sendAndAwait(text);
    if (this.o.quickAck) {
      try {
        const ack = await this.o.quickAck(text);
        if (ack && !this.cancelled) { console.log(`[voz] ack: "${ack}"`); this._enqueue(ack); }
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
    console.log(`[voz] resposta: ${reply.length} chars, ${all.length} frase(s) p/ TTS`);
    for (const s of all) this._enqueue(s);
  }

  // ─── TTS (fila) ─────────────────────────────────────────────────────────────
  private _enqueue(sentence: string): void {
    const p = this.o.tts(sentence)
      .then((b) => { console.log(`[voz] tts "${sentence.slice(0, 24)}…" → ${b?.size ?? 0} bytes`); return b; })
      .catch((e) => { console.log(`[voz] tts ERRO: ${(e as Error).message}`); return null; });
    this.audioQueue.push(p);
    if (!this.queueRunning) void this._drainQueue();
  }

  private async _drainQueue(): Promise<void> {
    this.queueRunning = true;
    while (this.audioQueue.length > 0 && !this.cancelled) {
      const blob = await this.audioQueue.shift()!;
      if (!blob || this.cancelled) continue;
      await this._play(blob);
    }
    this.queueRunning = false;
    this.playing = false;
    this._refreshState();
  }

  // Corta o playback atual e esvazia a fila de TTS (barge-in / stop).
  private _stopPlayback(): void {
    this.audioQueue = [];
    const a = this.curAudio;
    this.curAudio = null;
    this.playing = false;
    if (a) { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } }
    const r = this.playResolve; this.playResolve = null;
    r?.();
  }

  private _play(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = this.persistentAudio ?? new Audio();
      audio.src = url;
      audio.muted = false;
      this.curAudio = audio;
      this.playing = true;
      this._refreshState();
      console.log(`[voz] tocando áudio (${blob.size} bytes)`);
      let done = false;
      const finish = () => { if (done) return; done = true; URL.revokeObjectURL(url); this.playResolve = null; resolve(); };
      this.playResolve = finish; // barge-in/stop resolve na hora
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch((e) => { console.log(`[voz] play bloqueado: ${(e as Error).message}`); this.o.onError?.(new Error('Áudio bloqueado pelo navegador. Clique na esfera de novo.')); finish(); });
    });
  }
}
