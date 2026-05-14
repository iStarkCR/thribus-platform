/**
 * Cortex Playground — testa /cortex/analyze direto pelo painel.
 *
 * Usa uma API key salva localmente (localStorage). Útil pra smoke test
 * e demos de venda.
 */

import { useEffect, useRef, useState } from 'react';
import { Play, Loader2, Send, AlertCircle, User, Bot } from 'lucide-react';
import { cortexAdmin, type AnalyzeResult } from '@/services/cortexAdmin';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  result?: AnalyzeResult;
}

const LS_KEY = 'cortex.playground.apiKey';

export function CortexPlayground() {
  const [apiKey, setApiKey] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>(() =>
    `playground-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const [entityType, setEntityType] = useState('customer');
  const [entityId, setEntityId] = useState('');
  const [channel, setChannel] = useState('webchat');
  const [forceAgent, setForceAgent] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!input.trim() || !apiKey.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    setError(null);
    try {
      const result = await cortexAdmin.analyze(apiKey.trim(), {
        sessionId,
        input: text,
        channel: channel || undefined,
        entity: entityId
          ? { type: entityType || 'entity', id: entityId }
          : undefined,
        hints: forceAgent ? { forceAgent } : undefined,
      });
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: result.reply ?? '(sem resposta textual — só ações)',
          result,
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function resetSession() {
    setSessionId(`playground-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setMessages([]);
    setError(null);
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Config sidebar */}
      <aside className="col-span-4 space-y-3">
        <div className="rounded-xl border border-default bg-surface-1 p-4 space-y-3">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-creme-faint">Configuração</h3>

          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
              API key
            </span>
            <input
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                localStorage.setItem(LS_KEY, e.target.value);
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
              placeholder="ck_live_…"
              type="password"
            />
          </label>

          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
              Session ID
            </span>
            <div className="flex gap-1 mt-1">
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
              />
              <button
                onClick={resetSession}
                className="px-2 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-creme-mute text-[11.5px] font-bold"
                title="Nova sessão (limpa histórico)"
              >
                ↻
              </button>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
                Entity type
              </span>
              <input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="mt-1 w-full px-2.5 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
                Entity ID
              </span>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="(opcional)"
                className="mt-1 w-full px-2.5 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
              Canal
            </span>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme"
              placeholder="webchat | whatsapp | crm"
            />
          </label>

          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
              Forçar agent (opcional)
            </span>
            <select
              value={forceAgent}
              onChange={(e) => setForceAgent(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme"
            >
              <option value="">Brain decide</option>
              <option value="bianca">Bianca (vendas)</option>
              <option value="renata">Renata (RH)</option>
              <option value="marcos">Marcos (financeiro)</option>
              <option value="carla">Carla (suporte)</option>
            </select>
          </label>
        </div>
      </aside>

      {/* Chat */}
      <div className="col-span-8">
        <div className="rounded-xl border border-default bg-surface-1 flex flex-col" style={{ height: '70vh' }}>
          <div className="px-5 py-3 border-b border-default flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-creme flex items-center gap-2">
              <Play size={14} className="text-brand" />
              Playground
            </h3>
            <div className="text-[11.5px] text-creme-faint font-mono">
              session: {sessionId.slice(0, 24)}…
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-[13.5px] text-creme-mute pt-12">
                Configure a API key na lateral e mande uma mensagem pra testar.
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-[12.5px] text-creme-mute">
                <Loader2 size={14} className="animate-spin" />
                Brain processando…
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-200 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-default flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              className="flex-1 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
              placeholder="Digite a mensagem do cliente…"
              disabled={loading || !apiKey}
            />
            <button
              onClick={send}
              disabled={loading || !apiKey || !input.trim()}
              className="px-3 py-2 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send size={13} />
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand text-bg px-4 py-2.5 text-[13.5px]">
          {msg.text}
        </div>
        <div className="w-8 h-8 rounded-full bg-surface-3 border border-hover flex items-center justify-center text-creme-mute shrink-0">
          <User size={14} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-brand/10 text-brand-bright flex items-center justify-center shrink-0">
        <Bot size={14} />
      </div>
      <div className="max-w-[80%] space-y-2">
        <div className="rounded-2xl bg-surface-3 border border-default text-creme px-4 py-2.5 text-[13.5px] whitespace-pre-wrap">
          {msg.text}
        </div>
        {msg.result && (
          <div className="text-[11px] text-creme-faint font-mono space-y-0.5">
            <div>
              agent: <span className="text-brand-bright">{msg.result.metrics.agentUsed ?? 'direct'}</span>
              {' · '}
              {msg.result.metrics.latencyMs}ms
              {' · '}
              ${msg.result.metrics.estimatedCostUsd.toFixed(5)}
              {' · '}
              {msg.result.metrics.inputTokens + msg.result.metrics.outputTokens} tokens
            </div>
            {msg.result.insights.length > 0 && (
              <div>insights: {msg.result.insights.length}</div>
            )}
            {msg.result.actions.length > 0 && (
              <details className="cursor-pointer">
                <summary className="hover:text-creme-mute">
                  {msg.result.actions.length} ações registradas
                </summary>
                <ul className="mt-1 ml-3 space-y-0.5">
                  {msg.result.actions.map((a, i) => (
                    <li key={i}>
                      [{a.type}]{a.agent && ` ${a.agent}`}
                      {a.tool && ` → ${a.tool}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="opacity-50">trace: {msg.result.traceId.slice(0, 12)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
