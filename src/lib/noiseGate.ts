/**
 * Noise gate adaptativo pro microfone do modo voz. Aprende o ruído de fundo
 * (ventilador, ambiente, mic distante) e só deixa passar o que sobe acima dele —
 * ruído constante vira silêncio antes de chegar no VAD da OpenAI, que então não
 * fica preso em "falando" nem transforma ruído em pergunta.
 *
 * Roda num AudioWorklet (thread de áudio): continua funcionando com o app em
 * segundo plano, onde requestAnimationFrame para.
 */

export const NOISE_GATE_PROCESSOR = /* js */ `
class ThribusNoiseGate extends AudioWorkletProcessor {
  constructor() {
    super();
    const bps = sampleRate / 128;            // blocos por segundo
    this.warmup = Math.round(bps * 0.6);     // calibra o ruído nos primeiros 0,6 s
    this.slowA = 1 / (bps * 1.5);            // piso segue o ruído com ~1,5 s de inércia
    this.creep = Math.pow(10, 1 / 20 / bps); // com o gate aberto, o piso sobe ~1 dB/s
    this.holdMax = Math.round(bps * 0.6);    // segura aberto 600 ms (pausa entre palavras)
    this.attack = 1 - Math.exp(-1 / (0.005 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.08 * sampleRate));
    // Fechado = atenua ~20 dB, não zera: silêncio digital fazia o VAD fechar o
    // turno no meio da frase.
    this.closedGain = 0.1;
    // Lookahead: a saída sai atrasada ~32 ms, então o gate abre ANTES do começo
    // da palavra (consoantes fracas como o "c" de "ciclo" não são comidas).
    this.delay = new Float32Array(128 * 13);
    this.wpos = 128 * 12;
    this.rpos = 0;
    this.floor = 0;
    this.blocks = 0;
    this.open = false;
    this.hold = 0;
    this.g = this.closedGain;
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0];
    if (!inp) { for (const ch of out) ch.fill(0); return true; }
    const dl = this.delay, n = dl.length;
    for (let i = 0; i < inp.length; i++) dl[(this.wpos + i) % n] = inp[i];
    this.wpos = (this.wpos + inp.length) % n;
    let s = 0;
    for (let i = 0; i < inp.length; i++) s += inp[i] * inp[i];
    const rms = Math.sqrt(s / inp.length) + 1e-7;
    this.blocks++;

    if (this.blocks <= this.warmup) {
      this.floor = this.floor === 0 ? rms : this.floor + (rms - this.floor) * 0.05;
    } else if (this.open) {
      this.floor *= this.creep;
    } else {
      this.floor += (rms - this.floor) * this.slowA;
    }

    const loud = this.blocks > this.warmup && rms > Math.max(this.floor * 2, 0.002);
    const quiet = rms < this.floor * 1.6;
    if (loud) { this.open = true; this.hold = this.holdMax; }
    else if (this.open && quiet && --this.hold <= 0) this.open = false;

    const target = this.open ? 1 : this.closedGain;
    const k = target > this.g ? this.attack : this.release;
    for (const ch of out) {
      let g = this.g;
      for (let i = 0; i < ch.length; i++) { g += (target - g) * k; ch[i] = dl[(this.rpos + i) % n] * g; }
    }
    for (let i = 0; i < inp.length; i++) this.g += (target - this.g) * k;
    this.rpos = (this.rpos + inp.length) % n;
    return true;
  }
}
registerProcessor('thribus-noise-gate', ThribusNoiseGate);
`;

const loaded = new WeakSet<BaseAudioContext>();

export async function createNoiseGate(ctx: AudioContext): Promise<AudioWorkletNode> {
  if (!loaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([NOISE_GATE_PROCESSOR], { type: 'application/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    loaded.add(ctx);
  }
  return new AudioWorkletNode(ctx, 'thribus-noise-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
}
