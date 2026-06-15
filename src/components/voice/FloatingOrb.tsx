import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { useAppStore } from '@/hooks/useAppStore';
import { useWakeWordListener } from '@/hooks/useWakeWordListener';

const ORB_SIZE = 72;
const MARGIN = 18;
const BUKOWISKI_ID = 'bukowiski-thribus';
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
  const requestVoiceMode = useAppStore((s) => s.requestVoiceMode);
  const navigate = useNavigate();

  const [pos, setPos] = useState<Pos>(loadPos);
  const [dragging, setDragging] = useState(false);
  const [wakeFlash, setWakeFlash] = useState(false);
  const dragState = useRef<{ moved: boolean; offX: number; offY: number; startX: number; startY: number } | null>(null);

  // Mantém o orbe dentro da viewport ao redimensionar.
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const goVoice = useCallback(() => {
    requestVoiceMode();
    navigate(`/talk?agent=${BUKOWISKI_ID}`);
  }, [navigate, requestVoiceMode]);

  // Wake word: pausa enquanto o modo voz roda (mic já em uso pelo TalkPage).
  const onWake = useCallback(() => {
    setWakeFlash(true);
    setTimeout(() => setWakeFlash(false), 2200);
    goVoice();
  }, [goVoice]);

  useWakeWordListener({
    enabled: orbEnabled && wakeWordEnabled && !voiceModeActive,
    onWake,
  });

  // ─── Drag ──────────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { moved: false, offX: e.clientX - pos.x, offY: e.clientY - pos.y, startX: e.clientX, startY: e.clientY };
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
    } else {
      goVoice(); // clique sem arrastar → liga o modo voz direto
    }
  };

  if (!orbEnabled) return null;

  const intensity = voiceModeActive ? 0.85 : wakeFlash ? 0.55 : 0.12;
  const listening = wakeWordEnabled && !voiceModeActive;

  return (
    <button
      aria-label="Bukowiski — modo voz"
      title={voiceModeActive ? 'Modo voz ativo' : 'Falar com o Bukowiski (modo voz)'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="fixed z-[60] rounded-full select-none touch-none group"
      style={{
        left: pos.x,
        top: pos.y,
        width: ORB_SIZE,
        height: ORB_SIZE,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Halo externo bem leve */}
      <div
        className="absolute -inset-2 rounded-full transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(var(--brand-bright)/0.22) 0%, transparent 70%)',
          opacity: voiceModeActive ? 0.9 : 0.4,
        }}
      />
      {/* Esfera circular contida */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden border border-brand/30 shadow-lg bg-surface-1/80 backdrop-blur-sm"
        style={{ maskImage: 'radial-gradient(circle, #000 62%, transparent 88%)', WebkitMaskImage: 'radial-gradient(circle, #000 62%, transparent 88%)' }}
      >
        <NeuralSphere className="absolute inset-0" intensity={intensity} speedMultiplier={1.3} interactionMultiplier={0} ambient={false} />
      </div>
      {/* Borda sutil "saindo" da esfera */}
      <div className={`absolute inset-0 rounded-full ring-1 transition-colors ${voiceModeActive ? 'ring-brand/60' : 'ring-brand/15'} pointer-events-none`} />
      {voiceModeActive && (
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
    </button>
  );
}
