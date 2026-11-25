import { describe, it, expect } from 'vitest';
import { NOISE_GATE_PROCESSOR } from './noiseGate';

const SR = 48000;
type Proc = { process: (i: Float32Array[][], o: Float32Array[][]) => boolean };

function makeGate(): Proc {
  let Cls: new () => Proc = null as never;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', NOISE_GATE_PROCESSOR)(
    class {}, (_: string, c: new () => Proc) => { Cls = c; }, SR,
  );
  return new Cls();
}

// Ruído branco determinístico + "voz" (senoide forte) em trechos.
function run(gate: Proc, seconds: number, noiseRms: number, voice: (t: number) => number) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const outRms: number[] = [];
  for (let b = 0; b < (seconds * SR) / 128; b++) {
    const inp = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      const t = (b * 128 + i) / SR;
      inp[i] = rnd() * noiseRms * Math.sqrt(3) + voice(t) * Math.sin(2 * Math.PI * 220 * t);
    }
    const out = new Float32Array(128);
    gate.process([[inp]], [[out]]);
    outRms.push(Math.sqrt(out.reduce((a, v) => a + v * v, 0) / 128));
  }
  return (from: number, to: number) => {
    const s = outRms.slice(Math.floor((from * SR) / 128), Math.floor((to * SR) / 128));
    return s.reduce((a, v) => a + v, 0) / s.length;
  };
}

describe('noise gate', () => {
  it('silencia ruído constante alto e deixa a voz passar', () => {
    const noise = 0.075; // ~ -22 dB, o mic da webcam medido
    const avg = run(makeGate(), 8, noise, (t) => (t > 3 && t < 5 ? 0.35 : 0));
    expect(avg(1, 2.9)).toBeLessThan(noise * 0.05);   // só ruído: cortado
    expect(avg(3.1, 4.9)).toBeGreaterThan(0.2);       // voz: passa
    expect(avg(6, 8)).toBeLessThan(noise * 0.05);     // fecha de novo depois
  });

  it('em ambiente silencioso, fala baixa passa', () => {
    const avg = run(makeGate(), 4, 0.002, (t) => (t > 1.5 && t < 3 ? 0.03 : 0));
    expect(avg(1.7, 2.9)).toBeGreaterThan(0.015);
    expect(avg(0.8, 1.4)).toBeLessThan(0.001);
  });
});
