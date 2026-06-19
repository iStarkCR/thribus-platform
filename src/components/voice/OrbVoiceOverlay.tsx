import { X } from 'lucide-react';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import type { OrbConversation } from '@/hooks/useOrbConversation';

const MASK = 'radial-gradient(circle, #000 86%, transparent 99%)';

const STATE_UI = {
  idle: { label: 'Ouvindo', color: '124 217 154', hue: 0 },
  listening: { label: 'Ouvindo', color: '124 217 154', hue: 0 },
  thinking: { label: 'Pensando', color: '244 194 103', hue: -62 },
  speaking: { label: 'Respondendo', color: '127 176 245', hue: 95 },
} as const;

/**
 * Modo voz em tela cheia (estilo CORTEX): esfera grande reativa + status
 * (Ouvindo / Pensando / Respondendo). Aberto pela wake word — sem chat.
 */
export function OrbVoiceOverlay({ conv, onClose }: { conv: OrbConversation; onClose: () => void }) {
  const ui = STATE_UI[conv.state];
  const intensity = conv.speaking ? 0.95 : conv.listening ? 0.8 : 0.55;

  return (
    <div
      className="fixed inset-0 z-[62] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #142e1f 0%, #040805 76%)' }}
    >
      {/* Rede de fundo — esfera grande bem esmaecida */}
      <div className="absolute inset-0 opacity-[0.18] pointer-events-none">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[140vmin]">
          <NeuralSphere className="absolute inset-0" intensity={0.2} speedMultiplier={0.6} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={1} />
        </div>
      </div>

      {/* Topo: rótulo + fechar */}
      <div className="absolute top-0 inset-x-0 h-16 px-7 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-creme-faint/80">Modo voz</div>
        <button onClick={onClose} title="Encerrar (ou diga “Bukowiski off”)" className="w-9 h-9 rounded-full border border-white/15 bg-white/5 backdrop-blur text-creme-mute hover:text-creme hover:bg-white/10 flex items-center justify-center transition-colors">
          <X size={17} />
        </button>
      </div>

      {/* Esfera central + anel tracejado + status */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="relative aspect-square w-[min(44vmin,400px)]">
          <div
            className="absolute inset-0 rounded-full overflow-hidden transition-[filter] duration-500"
            style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: ui.hue ? `hue-rotate(${ui.hue}deg)` : undefined }}
          >
            <NeuralSphere className="absolute inset-0" intensity={intensity} speedMultiplier={1} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} />
          </div>
          {/* glow */}
          <div className="absolute -inset-6 rounded-full pointer-events-none transition-all duration-500" style={{ background: `radial-gradient(circle, rgba(${ui.color}/0.22) 0%, transparent 66%)` }} />
          {/* anel tracejado girando */}
          <div className="absolute -inset-[7%] rounded-full border border-dashed pointer-events-none" style={{ borderColor: `rgba(${ui.color}/0.35)`, animation: 'orbSpin 18s linear infinite' }} />
          <style>{`@keyframes orbSpin{to{transform:rotate(360deg)}}`}</style>
        </div>

        {/* Pílula de status */}
        <div
          className="flex items-center gap-2.5 px-5 py-2 rounded-full border backdrop-blur transition-all duration-300"
          style={{ borderColor: `rgba(${ui.color}/0.4)`, background: `rgba(${ui.color}/0.08)` }}
        >
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: `rgb(${ui.color})` }} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${ui.color})` }}>{ui.label}</span>
        </div>
      </div>

      {/* Dica */}
      <div className="absolute bottom-10 text-[12px] text-creme-faint/70">
        Diga <span className="font-semibold text-creme-mute">“Bukowiski off”</span> pra encerrar
      </div>
    </div>
  );
}
