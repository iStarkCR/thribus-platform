import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';

// Entrada: idle (login) → focus (form some, orb vem pro centro) → suck (orb é
// sugada pra um ponto) → greet ("Bom dia, Fulano") → sistema.
type Phase = 'idle' | 'focus' | 'suck' | 'greet';
const FOCUS_MS = 650;
const SUCK_MS = 750;
const GREET_MS = 1700;

function brasiliaGreeting(): string {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date());
  const h = parseInt(s, 10) % 24;
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [orbShift, setOrbShift] = useState({ x: 0, y: 0 });
  const [greetName, setGreetName] = useState('');
  const enteringRef = useRef(false);
  const orbRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { session, user, configured, signInWithPassword, signInWithOAuth } = useSession();

  // Já logado ao abrir a tela → direto pro sistema (sem animação).
  useEffect(() => {
    if (session && !enteringRef.current) nav('/');
  }, [session, nav]);

  const enter = (name: string) => {
    setGreetName(name);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setPhase('greet'); setTimeout(() => nav('/'), GREET_MS); return; }
    // Leva a orb do lugar dela até o centro da tela.
    const r = orbRef.current?.getBoundingClientRect();
    if (r) setOrbShift({ x: window.innerWidth / 2 - (r.left + r.width / 2), y: window.innerHeight / 2 - (r.top + r.height / 2) });
    setPhase('focus');
    setTimeout(() => setPhase('suck'), FOCUS_MS);
    setTimeout(() => setPhase('greet'), FOCUS_MS + SUCK_MS);
    setTimeout(() => nav('/'), FOCUS_MS + SUCK_MS + GREET_MS);
  };

  const firstNameOf = (meta: Record<string, unknown> | undefined, mail: string) => {
    const raw = ((meta?.name as string | undefined) ?? mail.split('@')[0] ?? '').split(' ')[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || phase !== 'idle') return;
    setError(null);
    setLoading(true);
    enteringRef.current = true;

    if (!configured) {
      setLoading(false);
      enter(firstNameOf(undefined, email));
      return;
    }

    const { error: err } = await signInWithPassword(email, password);
    setLoading(false);
    if (err) {
      enteringRef.current = false;
      setError(err.message === 'Invalid login credentials' ? 'Email ou senha incorretos.' : err.message);
      return;
    }
    const { data } = await supabase!.auth.getUser();
    enter(firstNameOf(data.user?.user_metadata ?? user?.user_metadata, email));
  };

  const oauth = async (provider: 'google' | 'apple') => {
    setError(null);
    setLoading(true);
    if (!configured) { setLoading(false); enteringRef.current = true; enter('Charles'); return; }
    const { error: err } = await signInWithOAuth(provider);
    setLoading(false);
    if (err) setError(err.message);
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) { setError('Digite seu email acima pra receber o link de redefinição.'); return; }
    if (!supabase) return;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname + '#/login',
    });
    if (err) setError(err.message);
    else useAppStore.getState().addToast('Enviamos um link de redefinição pro seu email.', 'green');
  };

  const leaving = phase !== 'idle';
  const orbTransform =
    phase === 'focus' ? `translate(${orbShift.x}px, ${orbShift.y}px) scale(1.12)`
    : phase === 'suck' || phase === 'greet' ? `translate(${orbShift.x}px, ${orbShift.y}px) scale(0) rotate(540deg)`
    : 'none';

  return (
    <div className="fixed inset-0 bg-surface-0 overflow-y-auto overflow-x-hidden">
      {/* Fundo: brilho sálvia sutil atrás da orb */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: phase === 'greet' ? 0.4 : 1,
          background: 'radial-gradient(60% 45% at 50% 30%, rgba(46,125,91,0.16) 0%, transparent 70%), radial-gradient(40% 30% at 80% 85%, rgba(212,180,110,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative min-h-full flex flex-col items-center px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        {/* Orb — a mesma do modo voz */}
        <div className="flex-1 w-full flex items-center justify-center min-h-[240px] py-4">
          <div
            ref={orbRef}
            className="relative aspect-square w-[min(74vw,40vh)] md:w-[min(46vh,440px)] will-change-transform"
            style={{
              transform: orbTransform,
              filter: phase === 'suck' ? 'brightness(2.2)' : 'none',
              transition: phase === 'focus'
                ? `transform ${FOCUS_MS}ms cubic-bezier(.22,1,.36,1)`
                : phase === 'suck'
                  ? `transform ${SUCK_MS}ms cubic-bezier(.7,0,.84,0), filter ${SUCK_MS}ms ease-in`
                  : undefined,
            }}
          >
            <div
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{ WebkitMaskImage: 'radial-gradient(circle, #000 86%, transparent 99%)', maskImage: 'radial-gradient(circle, #000 86%, transparent 99%)' }}
            >
              <NeuralSphere className="absolute inset-0" intensity={leaving ? 1 : 0.35} pulseSpeed={leaving ? 1.6 : 0.9} />
            </div>
          </div>
          {/* Clarão no ponto onde a orb some */}
          {(phase === 'suck' || phase === 'greet') && (
            <span
              className="pointer-events-none fixed left-1/2 top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-brand-bright login-implode"
              style={{ animationDelay: `${SUCK_MS - 120}ms` }}
            />
          )}
        </div>

        {/* Formulário */}
        <div
          className="w-full max-w-[400px] transition-all duration-500 ease-out"
          style={{ opacity: leaving ? 0 : 1, transform: leaving ? 'translateY(24px)' : 'none', pointerEvents: leaving ? 'none' : undefined }}
        >
          <h1 className="text-[26px] md:text-[28px] font-bold text-creme tracking-tight">Entrar</h1>
          <p className="text-[14px] text-creme-mute mt-1">Acesse seu painel de colaboradores digitais.</p>

          {!configured && (
            <div className="mt-4 p-2.5 rounded-lg bg-semantic-amber/10 border border-semantic-amber/30 text-[12px] text-semantic-amber flex items-center gap-1.5">
              <AlertCircle size={13} /> Auth em modo demo · qualquer credencial entra
            </div>
          )}
          {error && (
            <div className="mt-4 p-2.5 rounded-lg bg-semantic-red/10 border border-semantic-red/30 text-[13px] text-semantic-red flex items-start gap-1.5">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-creme-faint" />
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@empresa.com.br"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-surface-1/80 backdrop-blur border border-default text-[16px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-creme-faint" />
              <input
                type={showPwd ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full h-12 pl-10 pr-11 rounded-xl bg-surface-1/80 backdrop-blur border border-default text-[16px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand transition-colors"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Esconder senha' : 'Mostrar senha'} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-lg flex items-center justify-center text-creme-faint hover:text-creme">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={forgot} className="text-[13px] font-semibold text-brand-bright hover:underline">Esqueci minha senha</button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-brand text-white text-[15px] font-semibold hover:bg-brand-bright active:scale-[0.99] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <>Entrar <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-default" /></div>
            <div className="relative flex justify-center"><span className="px-3 bg-surface-0 text-[12px] text-creme-faint">ou continue com</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <OAuthBtn provider="google" label="Google" onClick={() => oauth('google')} disabled={loading} />
            <OAuthBtn provider="apple" label="Apple" onClick={() => oauth('apple')} disabled={loading} />
          </div>

          <p className="mt-6 text-center text-[11.5px] text-creme-faint">© 2026 Thribus Tech · Dados protegidos conforme a LGPD</p>
        </div>
      </div>

      {/* Saudação de entrada */}
      {phase === 'greet' && (
        <div className="fixed inset-0 flex items-center justify-center px-6 pointer-events-none">
          <div className="greet-anim text-center text-[clamp(32px,7vw,56px)] font-extrabold tracking-tight leading-tight">
            {brasiliaGreeting()}{greetName ? `, ${greetName}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function OAuthBtn({ provider, label, onClick, disabled }: { provider: 'google' | 'apple'; label: string; onClick: () => void; disabled?: boolean }) {
  const isApple = provider === 'apple';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'h-12 rounded-xl border text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-60',
        isApple ? 'bg-creme text-surface-1 border-creme hover:bg-creme-dim' : 'bg-surface-1/80 border-default text-creme hover:border-hover',
      )}
    >
      <BrandLogo slug={provider} size={18} />
      {label}
    </button>
  );
}
