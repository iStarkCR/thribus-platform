/**
 * Cortex Brain — painel de controle do "cérebro" do time.
 *
 * Espelho do controle do Claude dentro do sistema:
 *   • Modelo (Cortex Brain) — rebrand dos modelos reais, com mapeamento claro.
 *   • Capacidade — slider de esforço (rápido ↔ inteligente), igual ao Ultracode.
 *   • Uso & Limites — custo/tokens reais do time + teto de gasto configurável.
 *   • Skills — cadastro direto pelo sistema (em breve).
 *
 * A ponte (bridge) lê esta config e aplica em toda execução do time, gravando
 * o custo real em cortex_usage.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Brain, Gauge, Activity, DollarSign, Clock, Hash, Zap, Sparkles,
  Lock, Check, Cpu, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore } from '@/hooks/useAppStore';
import {
  CORTEX_BRAINS, EFFORT_LEVELS, DEFAULT_CORTEX_CONFIG, brainOf, effortIndex,
  getCortexConfig, saveCortexConfig, getUsageSummary, subscribeUsage,
  cortexBrainConfigured,
  CONTEXT_LIMIT_MIN, CONTEXT_LIMIT_MAX, CONTEXT_LIMIT_STEP,
  type CortexBrainConfig, type CortexModel, type CortexEffort, type UsageSummary,
} from '@/services/cortexBrain';
import { EffortSlider } from '@/components/cortex/EffortSlider';

const money = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

function Bars({ n, tone }: { n: number; tone: 'speed' | 'intel' | 'cost' }) {
  const color = tone === 'cost' ? 'bg-amber-400/80' : tone === 'speed' ? 'bg-sky-400/80' : 'bg-brand-bright';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={clsx('h-1.5 w-3 rounded-full', i <= n ? color : 'bg-surface-3')} />
      ))}
    </div>
  );
}

export function CortexBrainPage() {
  const addToast = useAppStore((s) => s.addToast);
  const [cfg, setCfg] = useState<CortexBrainConfig>(DEFAULT_CORTEX_CONFIG);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState(0);

  const brain = brainOf(cfg.model);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [c, u] = await Promise.all([getCortexConfig(), getUsageSummary()]);
        if (!on) return;
        setCfg(c);
        setUsage(u);
      } catch {
        if (on) addToast('Falha ao carregar o Cortex Brain', 'red');
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [addToast]);

  // Uso em tempo real: a ponte grava → o painel atualiza sozinho.
  useEffect(() => {
    if (!cortexBrainConfigured) return;
    return subscribeUsage(() => { getUsageSummary().then(setUsage).catch(() => {}); });
  }, []);

  async function persist(next: CortexBrainConfig, silent = false) {
    setCfg(next);
    try {
      await saveCortexConfig(next);
      setSavedAt(Date.now());
      if (!silent) addToast('Cortex Brain atualizado', 'green');
    } catch {
      addToast('Falha ao salvar', 'red');
    }
  }

  const pickModel = (model: CortexModel) => {
    const b = brainOf(model);
    // ao trocar pra um modelo sem esforço, mantém o valor mas ele fica inerte
    persist({ ...cfg, model, effort: b.effortable ? cfg.effort : cfg.effort });
  };
  const setEffort = (effort: CortexEffort) => persist({ ...cfg, effort });

  const budgetPct = useMemo(() => {
    if (!usage || cfg.monthlyBudgetUsd <= 0) return null;
    return Math.min(100, (usage.costMonth / cfg.monthlyBudgetUsd) * 100);
  }, [usage, cfg.monthlyBudgetUsd]);

  if (loading) {
    return <div className="text-creme-faint text-[12.5px] font-mono">Carregando Cortex Brain…</div>;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-creme tracking-tight flex items-center gap-2">
            <Brain size={22} className="text-brand-bright" />
            Cortex Brain
          </h1>
          <p className="text-sm text-creme-mute mt-1">
            O cérebro do seu time. Escolha o modelo, controle a capacidade e acompanhe o uso real —
            tudo aplicado direto no Bukowiski e nos colaboradores.
          </p>
        </div>
        {savedAt > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[12px] text-brand-bright">
            <Check size={13} /> salvo
          </span>
        )}
      </div>

      {/* ── Capacidade: modelo + esforço ─────────────────────────────────── */}
      <section className="rounded-xl border border-default bg-surface-1 p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-brand-bright" />
          <h2 className="text-[15px] font-bold text-creme">Capacidade</h2>
          <span className="text-[12px] text-creme-faint">— qual cérebro e quanto ele pensa</span>
        </div>

        {/* Modelos (Cortex Brain) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CORTEX_BRAINS.map((b) => {
            const active = cfg.model === b.model;
            return (
              <button
                key={b.model}
                onClick={() => pickModel(b.model)}
                className={clsx(
                  'text-left rounded-lg border p-3.5 transition-all',
                  active
                    ? 'border-brand bg-brand/5 ring-1 ring-brand/40'
                    : 'border-default bg-surface-2 hover:border-hover',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[14px] text-creme flex items-center gap-1.5">
                    <Cpu size={14} className={active ? 'text-brand-bright' : 'text-creme-faint'} />
                    {b.name}
                  </span>
                  {active && <Check size={15} className="text-brand-bright" />}
                </div>
                <div className="mt-1 inline-block rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-creme-mute">
                  {b.real}
                </div>
                <p className="mt-2 text-[12.5px] text-creme-mute leading-snug">{b.tagline}</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[10.5px] text-creme-faint">
                  <div>velocidade<div className="mt-0.5"><Bars n={b.speed} tone="speed" /></div></div>
                  <div>inteligência<div className="mt-0.5"><Bars n={b.intel} tone="intel" /></div></div>
                  <div>custo<div className="mt-0.5"><Bars n={b.cost} tone="cost" /></div></div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Esforço (Ultracode-like) */}
        <div className="rounded-lg border border-default bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-creme flex items-center gap-1.5">
              <Zap size={14} className="text-brand-bright" /> Esforço
            </span>
            <span className="text-[12px] font-mono text-creme-mute">
              {EFFORT_LEVELS[effortIndex(cfg.effort)].label}
            </span>
          </div>

          {brain.effortable ? (
            <>
              <EffortSlider value={cfg.effort} onChange={setEffort} className="mt-3" />
              <p className="mt-3 text-[11.5px] text-creme-mute">
                {EFFORT_LEVELS[effortIndex(cfg.effort)].hint}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11.5px] text-creme-faint flex items-center gap-1.5">
              <Lock size={12} />
              O esforço só ajusta o <strong className="text-creme-mute font-semibold">Max</strong> e o{' '}
              <strong className="text-creme-mute font-semibold">Fable</strong>. {brain.name} roda na capacidade nativa.
            </p>
          )}
        </div>

        {/* Teto de contexto — quando rotacionar/resetar a conversa */}
        <ContextLimitControl
          value={cfg.contextLimitTokens}
          onSave={(v) => persist({ ...cfg, contextLimitTokens: v })}
        />

        <p className="text-[11.5px] text-creme-faint flex items-center gap-1.5">
          <Brain size={12} />
          Em uso agora: <strong className="text-creme-mute font-semibold">{brain.name}</strong>
          <span className="font-mono">({brain.real})</span>
          {brain.effortable && <>· esforço <strong className="text-creme-mute font-semibold">{EFFORT_LEVELS[effortIndex(cfg.effort)].label}</strong></>}
        </p>
      </section>

      {/* ── Uso & Limites ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-default bg-surface-1 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand-bright" />
          <h2 className="text-[15px] font-bold text-creme">Uso & Limites</h2>
          <span className="text-[12px] text-creme-faint">— consumo real do time (últimos 30 dias)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={DollarSign} label="Custo (30d)" value={money(usage?.costMonth ?? 0)} sub={`hoje ${money(usage?.costToday ?? 0)}`} />
          <Stat icon={Hash} label="Execuções" value={String(usage?.executions ?? 0)} sub={`7d ${money(usage?.cost7d ?? 0)}`} />
          <Stat icon={Cpu} label="Tokens" value={compact(usage?.totalTokens ?? 0)} sub="entrada+saída" />
          <Stat icon={Clock} label="Tempo médio" value={usage?.avgDurationMs ? `${Math.round(usage.avgDurationMs / 1000)}s` : '—'} sub="por execução" />
        </div>

        {/* Teto de gasto */}
        <div className="rounded-lg border border-default bg-surface-2 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BudgetInput
              label="Teto mensal (US$)"
              hint="0 = sem limite. Quando bater, te aviso aqui."
              value={cfg.monthlyBudgetUsd}
              onSave={(v) => persist({ ...cfg, monthlyBudgetUsd: v })}
            />
            <BudgetInput
              label="Teto por execução (US$)"
              hint="0 = sem limite. A ponte corta a tarefa se passar disso."
              value={cfg.maxBudgetUsd}
              onSave={(v) => persist({ ...cfg, maxBudgetUsd: v })}
            />
          </div>

          {budgetPct !== null && (
            <div>
              <div className="flex justify-between text-[11.5px] mb-1">
                <span className="text-creme-mute">Gasto do mês</span>
                <span className={clsx('font-mono', budgetPct >= 90 ? 'text-red-300' : budgetPct >= 70 ? 'text-amber-300' : 'text-creme-mute')}>
                  {money(usage?.costMonth ?? 0)} / {money(cfg.monthlyBudgetUsd)} · {budgetPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', budgetPct >= 90 ? 'bg-red-400' : budgetPct >= 70 ? 'bg-amber-400' : 'bg-brand')}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Por modelo */}
        {usage && usage.byModel.length > 0 && (
          <div className="rounded-lg border border-default bg-surface-2 p-4">
            <div className="text-[12px] font-semibold text-creme-mute mb-2">Custo por cérebro</div>
            <div className="space-y-1.5">
              {usage.byModel.map((m) => (
                <div key={m.model} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-creme">{brainName(m.model)} <span className="font-mono text-[11px] text-creme-faint">{m.model}</span></span>
                  <span className="text-creme-mute font-mono">{money(m.cost)} · {m.runs}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-creme-faint flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Os limites de assinatura do Claude (janela de 5h, semanal) são da Anthropic e não são expostos por API.
          Aqui você acompanha o <strong className="text-creme-mute font-semibold">uso real do seu time</strong> e
          define o <strong className="text-creme-mute font-semibold">seu próprio teto de gasto</strong>.
        </p>
      </section>

      {/* ── Skills ───────────────────────────────────────────────────────── */}
      <a href="#/cortex-skills" className="block rounded-xl border border-default bg-surface-1 p-5 hover:border-hover transition-colors">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-bright" />
          <h2 className="text-[15px] font-bold text-creme">Skills do Claude</h2>
          <span className="ml-auto text-[12px] text-brand-bright">abrir →</span>
        </div>
        <p className="mt-2 text-[12.5px] text-creme-mute leading-snug max-w-2xl">
          Cadastre skills pelo painel e ligue "alimentar o Claude": a ponte instala em{' '}
          <span className="font-mono">~/.claude/skills</span> e o Bukowiski passa a usar. Suas skills reais já
          aparecem lá (espelho).
        </p>
      </a>
    </div>
  );
}

function brainName(model: string): string {
  return CORTEX_BRAINS.find((b) => b.model === model)?.name ?? 'Cortex Brain';
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Activity; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-default bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-creme-faint">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-[18px] font-extrabold text-creme tracking-tight">{value}</div>
      {sub && <div className="text-[10.5px] text-creme-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function BudgetInput({ label, hint, value, onSave }: { label: string; hint: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value || ''));
  useEffect(() => { setV(String(value || '')); }, [value]);
  const commit = () => {
    const n = Math.max(0, Number(v) || 0);
    if (n !== value) onSave(n);
  };
  return (
    <div>
      <label className="text-[12px] font-semibold text-creme-mute">{label}</label>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-default bg-surface-3 px-2.5 focus-within:border-hover">
        <span className="text-creme-faint text-[13px]">US$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="0"
          className="w-full bg-transparent py-2 text-[13.5px] text-creme outline-none"
        />
      </div>
      <p className="mt-1 text-[10.5px] text-creme-faint">{hint}</p>
    </div>
  );
}

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`;

function ContextLimitControl({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { if (v !== value) onSave(v); };
  return (
    <div className="rounded-lg border border-default bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-creme flex items-center gap-1.5">
          <Gauge size={14} className="text-brand-bright" /> Teto de contexto
        </span>
        <span className="text-[12px] font-mono text-creme-mute">{fmtTokens(v)} tokens</span>
      </div>
      <input
        type="range"
        min={CONTEXT_LIMIT_MIN}
        max={CONTEXT_LIMIT_MAX}
        step={CONTEXT_LIMIT_STEP}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="mt-3 w-full accent-brand-bright cursor-pointer"
      />
      <div className="mt-1 flex justify-between text-[10.5px] text-creme-faint font-mono">
        <span>250k · enxuto, barato</span>
        <span>1M · memória longa</span>
      </div>
      <p className="mt-2 text-[11.5px] text-creme-mute">
        Quando a conversa passa de <strong className="text-creme-mute font-semibold">{fmtTokens(v)}</strong>, o time
        reseta a sessão resumindo o fio. Menor responde melhor e custa menos; maior lembra mais e fica mais caro.
      </p>
    </div>
  );
}
