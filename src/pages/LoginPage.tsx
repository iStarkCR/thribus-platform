import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck,
  Sparkles, Bot, Building2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { BrandLogo } from '@/components/shared/BrandLogo';

type Mode = 'signin' | 'signup';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock: 800ms de "auth" e vai pro dashboard
    setTimeout(() => { setLoading(false); nav('/'); }, 800);
  };

  const oauthMock = (provider: 'google' | 'apple') => {
    setLoading(true);
    setTimeout(() => { setLoading(false); nav('/'); }, 800);
    console.log(`[mock] OAuth ${provider}`);
  };

  return (
    <div className="fixed inset-0 grid grid-cols-1 lg:grid-cols-[1fr_460px] bg-surface-1 overflow-y-auto">
      {/* ESQUERDA — Brand panel */}
      <div className="hidden lg:flex flex-col p-12 bg-gradient-to-br from-brand-dim/30 via-surface-1 to-surface-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(107,143,94,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(212,201,168,0.08) 0%, transparent 50%)',
        }} />

        <div className="relative flex items-center gap-2.5 z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center">
            <Zap size={18} className="text-creme" />
          </div>
          <div className="flex flex-col">
            <span className="text-[19px] font-bold text-creme leading-tight tracking-tight">Thribus Platform</span>
            <span className="text-[11.5px] font-semibold text-brand-bright uppercase tracking-wider leading-tight">Colaboradores Digitais B2B</span>
          </div>
        </div>

        <div className="relative flex-1 flex flex-col justify-center z-10 max-w-[520px]">
          <h1 className="text-[42px] font-bold text-creme leading-[1.05] tracking-tight">
            Sua operação ganha<br />
            <span className="text-brand-bright">colaboradores que não dormem.</span>
          </h1>
          <p className="text-[16px] text-creme-mute mt-5 leading-relaxed">
            Agentes que conversam, fecham vendas, consultam seu ERP, escalam pra humano
            quando precisa. Tudo num painel só, com governança LGPD e analytics que
            seu CFO entende.
          </p>

          <div className="mt-8 space-y-3">
            <Feature icon={<Bot size={14} />} text="Multi-agente com handoff automático" />
            <Feature icon={<Building2 size={14} />} text="Integração com IXC, Stripe, Asaas, Talki" />
            <Feature icon={<ShieldCheck size={14} />} text="LGPD + SOC 2 evidence packs" />
            <Feature icon={<Sparkles size={14} />} text="Cortex Brain — motor multi-agente proprietário" />
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-[11.5px] font-mono text-creme-faint">
          <span>© 2026 Thribus Tech</span>
          <span>·</span>
          <a href="#" className="hover:text-creme">Termos</a>
          <a href="#" className="hover:text-creme">Privacidade</a>
          <a href="#" className="hover:text-creme">Status</a>
        </div>
      </div>

      {/* DIREITA — Form */}
      <div className="flex flex-col justify-center p-8 sm:p-12 bg-surface-2 border-l border-default">
        <div className="w-full max-w-[380px] mx-auto">
          {/* Logo mobile-only */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center">
              <Zap size={16} className="text-creme" />
            </div>
            <span className="text-[16px] font-bold text-creme">Thribus Platform</span>
          </div>

          <h2 className="text-[24px] font-bold text-creme">
            {mode === 'signin' ? 'Entrar na sua conta' : 'Criar conta'}
          </h2>
          <p className="text-[13px] text-creme-mute mt-1.5">
            {mode === 'signin' ? 'Acesse seu painel de colaboradores digitais.' : 'Comece com trial de 14 dias. Sem cartão.'}
          </p>

          {/* OAuth */}
          <div className="space-y-2.5 mt-6">
            <OAuthBtn provider="google" label="Continuar com Google" onClick={() => oauthMock('google')} disabled={loading} />
            <OAuthBtn provider="apple" label="Continuar com Apple" onClick={() => oauthMock('apple')} disabled={loading} />
          </div>

          {/* Divisor */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-default" /></div>
            <div className="relative flex justify-center"><span className="px-3 bg-surface-2 text-[11px] font-mono uppercase tracking-wider text-creme-faint">ou com email</span></div>
          </div>

          {/* Email + senha */}
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email">
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@empresa.com.br"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-1 border border-default text-[13.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                />
              </div>
            </Field>

            <Field label="Senha" trailing={mode === 'signin' && <a href="#" className="text-[11px] font-semibold text-brand-bright hover:underline">esqueci minha senha</a>}>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-creme-faint" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-surface-1 border border-default text-[13.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-creme-faint hover:text-creme">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-brand-dim border border-brand text-creme text-[13.5px] font-semibold hover:bg-brand transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 mt-2"
            >
              {loading ? 'Entrando…' : (
                <>
                  {mode === 'signin' ? 'Entrar' : 'Criar conta'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="text-center mt-5 text-[12.5px] text-creme-mute">
            {mode === 'signin' ? (
              <>Não tem conta? <button onClick={() => setMode('signup')} className="text-brand-bright font-semibold hover:underline">Criar grátis</button></>
            ) : (
              <>Já tem conta? <button onClick={() => setMode('signin')} className="text-brand-bright font-semibold hover:underline">Entrar</button></>
            )}
          </div>

          {/* Trust badges */}
          <div className="mt-8 pt-6 border-t border-default flex items-center justify-center gap-4 text-[10.5px] font-mono uppercase tracking-wider text-creme-faint">
            <span className="inline-flex items-center gap-1"><ShieldCheck size={11} /> LGPD</span>
            <span>·</span>
            <span>SOC 2</span>
            <span>·</span>
            <span>SSO Enterprise</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px] text-creme-mute">
      <span className="w-6 h-6 rounded-md bg-brand/15 text-brand-bright flex items-center justify-center shrink-0">{icon}</span>
      {text}
    </div>
  );
}

function Field({ label, trailing, children }: { label: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-creme-dim">{label}</label>
        {trailing}
      </div>
      {children}
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
        'w-full py-2.5 rounded-lg border text-[13.5px] font-semibold inline-flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed',
        isApple
          ? 'bg-creme text-surface-1 border-creme hover:bg-creme-dim'
          : 'bg-surface-1 border-default text-creme hover:border-hover',
      )}
    >
      <BrandLogo slug={provider} size={18} />
      {label}
    </button>
  );
}
