import { useState } from 'react';
import {
  FlaskConical, Send, Play, GitCompare, CheckCircle2, XCircle,
  CircleDot, Sparkles, Bot, Clock, Hash, Zap,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_PROMPT_VERSIONS, SEED_GOLDEN, SEED_EVAL_RUNS,
  type EvalRun, type PromptVersion, type EvalScore,
} from '@/lib/seed-lab';

type Tab = 'playground' | 'compare' | 'golden' | 'runs';

export function LabPage() {
  const [tab, setTab] = useState<Tab>('playground');
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <FlaskConical size={16} className="text-creme-mute" /> Agent Lab
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · playground · compare · golden answers · eval runs
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'playground'} onClick={() => setTab('playground')} icon={<Send size={13} />} label="Playground" />
        <TabBtn active={tab === 'compare'} onClick={() => setTab('compare')} icon={<GitCompare size={13} />} label="Compare A/B" />
        <TabBtn active={tab === 'golden'} onClick={() => setTab('golden')} icon={<Sparkles size={13} />} label="Golden Answers" count={SEED_GOLDEN.length} />
        <TabBtn active={tab === 'runs'} onClick={() => setTab('runs')} icon={<Play size={13} />} label="Eval Runs" count={SEED_EVAL_RUNS.length} />
      </div>

      {tab === 'playground' && <Playground />}
      {tab === 'compare' && <ComparePanel />}
      {tab === 'golden' && <GoldenPanel />}
      {tab === 'runs' && <RunsPanel />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px shrink-0',
        active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent',
      )}
    >
      {icon} {label}
      {count !== undefined && (
        <span className={clsx(
          'text-[11px] font-mono px-1.5 py-px rounded-full',
          active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

function Playground() {
  const [versionId, setVersionId] = useState(SEED_PROMPT_VERSIONS[0].id);
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<{ role: 'user' | 'assistant'; content: string; meta?: string }[]>([
    { role: 'assistant', content: 'Oi! Sou a Bianca da TexNet. Em que posso te ajudar hoje?', meta: 'mock · 312ms · 24 tok' },
  ]);

  const version = SEED_PROMPT_VERSIONS.find((v) => v.id === versionId)!;

  const send = () => {
    if (!input.trim()) return;
    setConversation((c) => [
      ...c,
      { role: 'user', content: input },
      { role: 'assistant', content: '[mock] Sim, atendemos sua rua com fibra. Tenho plano de 600 mega por R$ 99,90/mês, primeiros 3 meses por R$ 79,90. Posso reservar instalação?', meta: 'mock · 2.1s · 248 tok · 2 tool calls' },
    ]);
    setInput('');
  };

  return (
    <div className="grid grid-cols-[1fr_340px] gap-3 h-[calc(100vh-200px)] min-h-[480px]">
      <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-default flex items-center gap-3">
          <Bot size={14} className="text-brand-bright" />
          <span className="text-[13px] font-bold text-creme">{version.agentName}</span>
          <code className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand/10 text-brand-bright">{version.label}</code>
          {version.isLive && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/10 text-semantic-green">
              <CircleDot size={9} /> live
            </span>
          )}
          <span className="ml-auto text-[11px] text-creme-faint font-mono">testing — sem efeito em produção</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {conversation.map((m, i) => (
            <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx(
                'max-w-[80%] p-3 rounded-2xl text-[13px] leading-relaxed',
                m.role === 'user' ? 'bg-brand/20 text-creme' : 'bg-surface-1 border border-default text-creme-mute',
              )}>
                {m.content}
                {m.meta && (
                  <div className="text-[10.5px] font-mono text-creme-faint mt-1.5 pt-1.5 border-t border-default">
                    {m.meta}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-default">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Digite uma mensagem de teste..."
              className="flex-1 px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
            />
            <button onClick={send} className="p-2 rounded-lg bg-brand-dim border border-brand text-creme hover:bg-brand transition-all">
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-default">
          <h3 className="text-[13px] font-bold text-creme mb-2">Versão do prompt</h3>
          <select
            value={versionId}
            onChange={(e) => { setVersionId(e.target.value); setConversation([{ role: 'assistant', content: 'Oi! Sou a Bianca da TexNet. Em que posso te ajudar hoje?', meta: 'mock · 312ms · 24 tok' }]); }}
            className="w-full px-3 py-1.5 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme focus:outline-none focus:border-brand"
          >
            {SEED_PROMPT_VERSIONS.map((v) => (
              <option key={v.id} value={v.id}>{v.agentName} · {v.label}</option>
            ))}
          </select>
        </div>

        <div className="p-3 border-b border-default">
          <h4 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">System prompt</h4>
          <pre className="text-[11px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed bg-surface-1 p-2.5 rounded-md border border-default max-h-[200px] overflow-y-auto">{version.systemPrompt}</pre>
          <div className="text-[10.5px] text-creme-faint font-mono mt-2 flex items-center gap-2">
            <Hash size={10} /> {version.charsCount} chars · {version.author}
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          <button className="w-full py-2 rounded-md bg-brand-dim border border-brand text-creme text-[12.5px] font-semibold hover:bg-brand transition-all flex items-center justify-center gap-1.5">
            <Play size={12} /> Rodar eval suite
          </button>
          <p className="text-[11px] text-creme-faint mt-2 leading-relaxed">
            Executa {SEED_GOLDEN.length} golden answers contra esta versão e mostra pass rate.
          </p>
        </div>
      </div>
    </div>
  );
}

function ComparePanel() {
  const [a, setA] = useState(SEED_PROMPT_VERSIONS[0].id);
  const [b, setB] = useState(SEED_PROMPT_VERSIONS[1]?.id ?? SEED_PROMPT_VERSIONS[0].id);
  const va = SEED_PROMPT_VERSIONS.find((v) => v.id === a)!;
  const vb = SEED_PROMPT_VERSIONS.find((v) => v.id === b)!;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <CompareColumn version={va} side="A" onChange={(id) => setA(id)} />
        <CompareColumn version={vb} side="B" onChange={(id) => setB(id)} />
      </div>
      <div className="bg-surface-2 border border-default rounded-[10px] p-4">
        <h4 className="text-[13px] font-bold text-creme mb-3">Resposta a "tem fibra na rua do progresso 412 bagé?"</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-1 border border-default rounded-md p-3">
            <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">{va.label}</div>
            <p className="text-[12.5px] text-creme-mute leading-relaxed">Sim, atendemos sua rua com fibra. Tenho plano de 600 mega por R$ 99,90/mês, primeiros 3 meses por R$ 79,90.</p>
            <div className="text-[10.5px] font-mono text-creme-faint mt-2 flex items-center gap-2"><Zap size={9} /> 248 tok · 2.27s</div>
          </div>
          <div className="bg-surface-1 border border-default rounded-md p-3">
            <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">{vb.label}</div>
            <p className="text-[12.5px] text-creme-mute leading-relaxed">Sim! Atendemos com fibra. 600 mega R$ 99,90/mês (3m R$ 79,90). E que tal um combo TV por +R$ 19,90 — vale conhecer?</p>
            <div className="text-[10.5px] font-mono text-creme-faint mt-2 flex items-center gap-2"><Zap size={9} /> 312 tok · 2.41s</div>
          </div>
        </div>
      </div>
    </>
  );
}

function CompareColumn({ version, side, onChange }: { version: PromptVersion; side: 'A' | 'B'; onChange: (id: string) => void }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded-md bg-brand/15 text-brand-bright text-[11px] font-bold font-mono">{side}</span>
        <select
          value={version.id}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 rounded-md bg-surface-1 border border-default text-[12px] text-creme focus:outline-none focus:border-brand"
        >
          {SEED_PROMPT_VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>{v.agentName} · {v.label}</option>
          ))}
        </select>
      </div>
      <pre className="text-[11px] font-mono text-creme-dim whitespace-pre-wrap leading-relaxed bg-surface-1 p-2.5 rounded-md border border-default max-h-[160px] overflow-y-auto">{version.systemPrompt}</pre>
    </div>
  );
}

function GoldenPanel() {
  return (
    <div className="space-y-2">
      {SEED_GOLDEN.map((g) => (
        <div key={g.id} className="bg-surface-2 border border-default rounded-[10px] p-3.5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-brand/10 text-brand-bright">{g.category}</span>
                <span className="text-[10.5px] font-mono text-creme-faint">peso {g.weight.toFixed(1)}</span>
              </div>
              <p className="text-[12.5px] text-creme mt-1.5 italic">"{g.input}"</p>
              <p className="text-[12px] text-creme-mute mt-1.5 leading-relaxed">
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mr-2">esperado:</span>
                {g.expectedAnswer}
              </p>
            </div>
            <div className="shrink-0">
              {g.expectedToolCalls.length > 0 && (
                <div className="flex flex-col gap-1 items-end">
                  {g.expectedToolCalls.map((t) => (
                    <code key={t} className="text-[10.5px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-dim">{t}</code>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunsPanel() {
  const [openId, setOpenId] = useState<string | null>(SEED_EVAL_RUNS[0]?.id ?? null);
  return (
    <div className="space-y-2.5">
      {SEED_EVAL_RUNS.map((r) => (
        <RunCard key={r.id} run={r} expanded={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
      ))}
    </div>
  );
}

const SCORE_META: Record<EvalScore, { color: string; Icon: typeof CheckCircle2 }> = {
  pass: { color: 'text-semantic-green', Icon: CheckCircle2 },
  fail: { color: 'text-semantic-red', Icon: XCircle },
  partial: { color: 'text-semantic-amber', Icon: CircleDot },
};

function RunCard({ run: r, expanded, onToggle }: { run: EvalRun; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
      <button onClick={onToggle} className="w-full p-4 text-left hover:bg-surface-hover/30 transition-colors">
        <div className="flex items-center gap-4">
          <div className="text-center w-16 shrink-0">
            <div className={clsx(
              'text-[22px] font-bold font-mono',
              r.passRate >= 0.9 ? 'text-semantic-green' : r.passRate >= 0.7 ? 'text-semantic-amber' : 'text-semantic-red',
            )}>
              {(r.passRate * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-creme-faint">pass</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-creme">{r.agentName}</span>
              <code className="text-[11px] font-mono px-1.5 py-px rounded bg-brand/10 text-brand-bright">{r.promptVersionLabel}</code>
              <span className="text-[10.5px] font-mono text-creme-faint">
                {r.passed}✓ {r.partial}~ {r.failed}✗ / {r.totalCases}
              </span>
            </div>
            <div className="text-[10.5px] text-creme-faint mt-1 font-mono flex items-center gap-3">
              <span><Clock size={10} className="inline mr-1" />{r.avgLatencyMs}ms avg</span>
              <span><Zap size={10} className="inline mr-1" />{r.avgTokens} tok avg</span>
              <span>US$ {r.totalCost.toFixed(3)} total</span>
              <span>por {r.runBy} · {new Date(r.startedAt).toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <ChevronRight size={14} className={clsx('text-creme-faint transition-transform', expanded && 'rotate-90')} />
        </div>
      </button>

      {expanded && r.cases.length > 0 && (
        <div className="border-t border-default p-4 bg-surface-1/40 space-y-2">
          {r.cases.map((c, i) => {
            const meta = SCORE_META[c.score];
            const ScoreIcon = meta.Icon;
            return (
              <div key={i} className="bg-surface-1 border border-default rounded-md p-3">
                <div className="flex items-start gap-2.5">
                  <ScoreIcon size={14} className={clsx('shrink-0 mt-0.5', meta.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-creme italic">"{c.input}"</p>
                    <p className="text-[11.5px] text-creme-mute mt-1.5 leading-relaxed">
                      <span className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mr-1.5">actual:</span>
                      {c.actual}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[10.5px] font-mono text-creme-faint">
                      <span>sim: <span className={meta.color}>{(c.similarity * 100).toFixed(0)}%</span></span>
                      <span>tools: {c.toolMatch ? <CheckCircle2 size={9} className="inline text-semantic-green" /> : <XCircle size={9} className="inline text-semantic-red" />}</span>
                      <span>{c.latencyMs}ms</span>
                      <span>{c.tokens} tok</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
