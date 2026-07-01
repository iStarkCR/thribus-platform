import { useCallback, useEffect, useRef, useState } from 'react';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { useAppStore } from '@/hooks/useAppStore';
import { useWakeWordListener } from '@/hooks/useWakeWordListener';
import { useOrbConversation } from '@/hooks/useOrbConversation';
import { OrbChat } from '@/components/voice/OrbChat';

const ORB_SIZE = 88;
const MARGIN = 18;
const POS_KEY = 'orbPos';

type Pos = { x: number; y: number };

function defaultPos(): Pos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { x: w - ORB_SIZE - MARGIN, y: h - ORB_SIZE - MARGIN };
}

function loadPos(): Pos {
  if (typeof localStorage === 'undefined') return defaultPos();
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (typeof p.x === 'number' && typeof p.y === 'number') return clamp(p);
    }
  } catch { /* noop */ }
  return defaultPos();
}

function clamp(p: Pos): Pos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    x: Math.min(Math.max(MARGIN, p.x), w - ORB_SIZE - MARGIN),
    y: Math.min(Math.max(MARGIN, p.y), h - ORB_SIZE - MARGIN),
  };
}

export function FloatingOrb() {
  const orbEnabled = useAppStore((s) => s.orbEnabled);
  const wakeWordEnabled = useAppStore((s) => s.wakeWordEnabled);
  const voiceModeActive = useAppStore((s) => s.voiceModeActive);
  const sttBusy = useAppStore((s) => s.sttBusy);

  const conv = useOrbConversation();

  const [pos, setPos] = useState<Pos>(loadPos);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [wakeFlash, setWakeFlash] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const dragState = useRef<{ moved: boolean; offX: number; offY: number; startX: number; startY: number; shift: boolean; right: boolean } | null>(null);

  // Mantém o orbe dentro da viewport ao redimensionar.
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Wake word "Bukowiski" → conversa SÓ por voz (não abre o chat). A esfera muda
  // de cor; "Bukowiski off" encerra.
  const startVoiceRef = useRef(conv.startVoice);
  startVoiceRef.current = conv.startVoice;
  const onWake = useCallback(() => {
    setWakeFlash(true);
    setTimeout(() => setWakeFlash(false), 2200);
    startVoiceRef.current();
  }, []);

  useWakeWordListener({
    enabled: orbEnabled && wakeWordEnabled && !conv.voiceActive && !chatOpen && !voiceModeActive && !sttBusy,
    onWake,
  });

  // ─── Drag ──────────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { moved: false, offX: e.clientX - pos.x, offY: e.clientY - pos.y, startX: e.clientX, startY: e.clientY, shift: e.shiftKey, right: e.button === 2 };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    if (Math.abs(e.clientX - ds.startX) > 4 || Math.abs(e.clientY - ds.startY) > 4) ds.moved = true;
    setPos(clamp({ x: e.clientX - ds.offX, y: e.clientY - ds.offY }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const ds = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (!ds) return;
    if (ds.moved) {
      const final = clamp({ x: e.clientX - ds.offX, y: e.clientY - ds.offY });
      setPos(final);
      if (typeof localStorage !== 'undefined') localStorage.setItem(POS_KEY, JSON.stringify(final));
    } else if (ds.shift || ds.right) {
      // Shift+click ou botão direito → conversa por TEXTO (popover). Igual ao CORTEX.
      if (conv.voiceActive) conv.stopVoice();
      setChatOpen((o) => !o);
    } else {
      // Clique normal → MODO VOZ inline na própria orbe (toggle), igual ao CORTEX.
      // Sem tela cheia: o status aparece na esfera (Ouvindo/Pensando/Respondendo).
      setChatOpen(false);
      if (conv.voiceActive) conv.stopVoice(); else conv.startVoice();
    }
  };

  if (!orbEnabled) return null;

  const active = conv.voiceActive || chatOpen;
  const intensity = conv.voiceActive ? 0.95 : chatOpen ? 0.85 : hovered ? 0.7 : wakeFlash ? 0.6 : 0.32;
  const listening = wakeWordEnabled && !conv.voiceActive && !chatOpen && !voiceModeActive;
  // Esfera muda de cor pelo estado do modo voz: verde (ouvindo) → âmbar (pensando) → azul (respondendo).
  const hue = conv.voiceActive ? (conv.state === 'thinking' ? -62 : conv.state === 'speaking' ? 95 : conv.state === 'talking' ? 0 : 6) : 0;
  const haloColor = conv.state === 'thinking' ? '250 190 90' : conv.state === 'speaking' ? '110 170 250' : 'var(--brand-bright)';
  const stateLabel = conv.state === 'thinking' ? 'Pensando' : conv.state === 'speaking' ? 'Respondendo' : conv.state === 'talking' ? 'Você falando' : 'Ouvindo';

  return (
    <>
      <button
        aria-label="Falar com o Bukowiski"
        title="Clique pra falar · Shift+click pra texto · Arraste pra mover"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="ui-no-zoom fixed z-[60] rounded-full select-none touch-none group transition-transform duration-200"
        style={{
          left: pos.x,
          top: pos.y,
          width: ORB_SIZE,
          height: ORB_SIZE,
          cursor: dragging ? 'grabbing' : 'grab',
          transform: hovered && !dragging ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {/* Halo externo — cor segue o estado do modo voz */}
        <div
          className="absolute -inset-3 rounded-full transition-all duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle, rgba(${haloColor}/0.4) 0%, transparent 68%)`,
            opacity: active ? 1 : hovered ? 0.85 : 0.5,
          }}
        />
        <style>{`@keyframes orbBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}`}</style>
        {/* Esfera — pulsa e muda de cor (hue-rotate) quando em modo voz */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden transition-[filter] duration-500"
          style={{
            WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)',
            maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)',
            animation: active ? 'orbBreath 1.7s ease-in-out infinite' : undefined,
            filter: hue ? `hue-rotate(${hue}deg)` : undefined,
          }}
        >
          <NeuralSphere className="absolute inset-0" intensity={intensity} connectScale={0.62} />
        </div>
        {/* Anel só em hover/ativo */}
        <div className={`absolute inset-0 rounded-full transition-all pointer-events-none ${active ? 'ring-2 ring-brand/50' : hovered ? 'ring-1 ring-brand/30' : ''}`} />
        {active && (
          <div className="absolute inset-0 rounded-full ring-2 ring-brand/40 animate-ping pointer-events-none" />
        )}
        {/* Indicador de wake word ativo */}
        {listening && (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-semantic-red ring-2 ring-surface-1 animate-pulse pointer-events-none" />
        )}
        {/* Feedback ao ouvir "Bukowiski" */}
        {wakeFlash && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-lg bg-brand text-white text-[11px] font-semibold shadow-lg pointer-events-none">
            Bukowiski 👂
          </span>
        )}
        {/* Estado do modo voz — Ouvindo / Pensando / Respondendo (cor por estado) */}
        {conv.voiceActive && (
          <span
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] shadow-lg pointer-events-none flex items-center gap-1.5 backdrop-blur"
            style={{ background: `rgba(${haloColor}/0.16)`, color: `rgb(${haloColor})`, border: `1px solid rgba(${haloColor}/0.45)` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: `rgb(${haloColor})` }} />
            {stateLabel}
          </span>
        )}
      </button>

      {/* O orbe é à parte: voz SEMPRE inline (status na esfera) e chat próprio.
          O modo voz em tela cheia é do TalkPage, atrelado à conversa aberta. */}
      {chatOpen && (
        <OrbChat orb={{ x: pos.x, y: pos.y, size: ORB_SIZE }} onClose={() => setChatOpen(false)} conv={conv} />
      )}
    </>
  );
}
