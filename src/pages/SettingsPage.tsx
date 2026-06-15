import { useMemo, useState } from 'react';
import {
  Settings, Database, Cable, ShieldCheck, HardDrive,
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Copy,
  Server, KeyRound, Bot, Wrench, Pencil, Sun, Moon, Palette,
  Sparkles, Ear,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { isWakeWordSupported } from '@/hooks/useWakeWordListener';
import { VoiceAssistantConfig } from '@/components/settings/VoiceAssistantConfig';
import { WorkspaceEditModal } from '@/components/settings/WorkspaceEditModal';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/useTheme';

/**
 * Configurações — visão operacional do sistema.
 *
 * Mostra status das integrações reais (Supabase, n8n, VPS), workspaces
 * cadastrados, backup automático e env vars expostas. Tudo read-only —
 * mudanças sensíveis (credentials, API keys) ficam no painel do Coolify
 * ou no banco direto.
 */
export function SettingsPage() {
  const { workspaces, agents, tools, addToast } = useAppStore();
  const orbEnabled = useAppStore((s) => s.orbEnabled);
  const setOrbEnabled = useAppStore((s) => s.setOrbEnabled);
  const wakeWordEnabled = useAppStore((s) => s.wakeWordEnabled);
  const setWakeWordEnabled = useAppStore((s) => s.setWakeWordEnabled);
  const { theme, setTheme } = useTheme();

  // ─── Env vars (frontend-side via Vite) ─────────────────────────────────────
  const env = useMemo(() => ({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    schema: import.meta.env.VITE_SUPABASE_SCHEMA ?? 'public',
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
  }), []);

  const supabaseConnected = !!env.supabaseUrl && !!env.supabaseKey;
  const activeWorkspace = workspaces[0]; // futuro: workspace selecionado por user

  // Modal estado
  const [showEditWorkspace, setShowEditWorkspace] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null);

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    addToast(`${label} copiado`, 'green');
  };

  const mask = (s: string, visible = 6) =>
    s.length <= visible * 2 ? '•'.repeat(s.length) : `${s.slice(0, visible)}…${s.slice(-4)}`;

  /**
   * Testa cada integração com um ping leve. Resultado por toast.
   * Observação: alguns testes só dão pra fazer client-side de forma limitada
   * (ex: CRM) — pra teste de fato precisaria de endpoint admin no worker.
   */
  const testIntegration = async (name: string) => {
    setTestingIntegration(name);
    try {
      let result: { ok: boolean; detail: string } = { ok: false, detail: '' };

      if (name === 'Supabase') {
        if (!supabase) {
          result = { ok: false, detail: 'Sem cliente configurado' };
        } else {
          const start = Date.now();
          const { error } = await supabase.from('agents').select('id', { count: 'exact', head: true }).limit(1);
          result = error
            ? { ok: false, detail: error.message }
            : { ok: true, detail: `${Date.now() - start}ms` };
        }
      } else if (name === 'PostgREST self-hosted') {
        const start = Date.now();
        try {
          await fetch('https://pg-staging.thribustech.com/', { mode: 'no-cors' });
          result = { ok: true, detail: `${Date.now() - start}ms (no-cors)` };
        } catch (err) {
          result = { ok: false, detail: err instanceof Error ? err.message : 'erro' };
        }
      } else {
        result = { ok: false, detail: 'Teste não implementado pra essa integração ainda' };
      }

      addToast(`${name}: ${result.ok ? '✓' : '✗'} ${result.detail}`, result.ok ? 'green' : 'red');
    } finally {
      setTestingIntegration(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-4">
        <Settings size={16} className="text-creme-mute" /> Configurações
      </div>

      {/* ─── KPIs do sistema ────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <SystemStat
          icon={<Bot size={14} />}
          label="Colaboradores"
          value={agents.length}
          sub={`${agents.filter((a) => a.status === 'online').length} online`}
        />
        <SystemStat
          icon={<Wrench size={14} />}
          label="Ferramentas"
          value={tools.length}
          sub={`${tools.filter((t) => t.active).length} ativas`}
        />
        <SystemStat
          icon={<Server size={14} />}
          label="Workspaces"
          value={workspaces.length}
          sub="Multi-tenant"
        />
        <SystemStat
          icon={<ShieldCheck size={14} />}
          label="Ambiente"
          value={env.dev ? 'DEV' : env.mode.toUpperCase()}
          sub={env.dev ? 'Modo desenvolvimento' : 'Build de produção'}
          accent={env.dev ? 'amber' : 'green'}
        />
      </div>

      {/* ─── Aparência / Tema ───────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-default rounded-[10px] p-4 mb-5">
        <div className="flex items-center gap-2 text-[13.5px] font-bold text-creme mb-0.5">
          <Palette size={15} className="text-creme-mute" /> Aparência
        </div>
        <div className="text-[12.5px] text-creme-faint mb-3">Tema do painel.</div>
        <div className="flex gap-2.5 max-w-md">
          {([
            { id: 'dark', label: 'Escuro', icon: <Moon size={15} /> },
            { id: 'light', label: 'Claro', icon: <Sun size={15} /> },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[13.5px] font-semibold transition-colors ${
                theme === opt.id
                  ? 'bg-brand/10 border-brand/40 text-creme'
                  : 'bg-surface-2 border-default text-creme-mute hover:bg-surface-hover'
              }`}
            >
              {opt.icon} {opt.label}
              {theme === opt.id && <CheckCircle2 size={14} className="text-brand" />}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Assistente de voz (orbe + wake word) ───────────────────────── */}
      <div className="bg-surface-1 border border-default rounded-[10px] p-4 mb-5">
        <div className="flex items-center gap-2 text-[13.5px] font-bold text-creme mb-0.5">
          <Sparkles size={15} className="text-creme-mute" /> Assistente de voz
        </div>
        <div className="text-[12.5px] text-creme-faint mb-3">Orbe do Bukowiski flutuando pelos módulos e ativação por voz.</div>
        <div className="space-y-3 max-w-xl">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-start gap-2.5">
              <Sparkles size={16} className="text-brand mt-0.5 shrink-0" />
              <div>
                <div className="text-[13.5px] font-semibold text-creme">Orbe flutuante</div>
                <div className="text-[12px] text-creme-faint">Esfera do Bukowiski te acompanha em todas as telas. Clique nela pra ligar o modo voz; arraste pra reposicionar.</div>
              </div>
            </div>
            <button onClick={() => setOrbEnabled(!orbEnabled)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${orbEnabled ? 'bg-brand' : 'bg-surface-3 border border-default'}`}>
              <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${orbEnabled ? 'left-[calc(100%-21px)]' : 'left-[3px]'}`} />
            </button>
          </label>

          <label className={`flex items-center justify-between gap-3 ${orbEnabled ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
            <div className="flex items-start gap-2.5">
              <Ear size={16} className="text-brand mt-0.5 shrink-0" />
              <div>
                <div className="text-[13.5px] font-semibold text-creme">Palavra de ativação “Bukowiski”</div>
                <div className="text-[12px] text-creme-faint">Diga <span className="font-semibold text-creme-dim">“Bukowiski”</span> pra ligar o modo voz; diga de novo pra desligar. Escuta em segundo plano.</div>
              </div>
            </div>
            <button disabled={!orbEnabled} onClick={() => setWakeWordEnabled(!wakeWordEnabled)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${wakeWordEnabled && orbEnabled ? 'bg-brand' : 'bg-surface-3 border border-default'}`}>
              <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${wakeWordEnabled && orbEnabled ? 'left-[calc(100%-21px)]' : 'left-[3px]'}`} />
            </button>
          </label>

          {!isWakeWordSupported() && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-semantic-amber/10 text-semantic-amber text-[11.5px]">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>Este navegador não suporta reconhecimento de voz (SpeechRecognition). Use Chrome/Edge pra wake word.</span>
            </div>
          )}

          <VoiceAssistantConfig />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* ─── Workspace ativo ──────────────────────────────────────────── */}
        <Section
          icon={<Server size={14} />}
          title="Workspace ativo"
          subtitle={activeWorkspace ? activeWorkspace.name : 'Nenhum workspace cadastrado'}
          action={activeWorkspace ? (
            <button
              onClick={() => setShowEditWorkspace(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
              title="Editar workspace"
            >
              <Pencil size={11} /> Editar
            </button>
          ) : undefined}
        >
          {activeWorkspace ? (
            <div className="space-y-2 text-[13px]">
              <Field label="ID" value={<code className="text-[12px] font-mono text-creme-dim">{activeWorkspace.id}</code>} />
              <Field
                label="Provider LLM"
                value={
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 text-brand-bright font-mono text-[12px]">
                    {activeWorkspace.llmProvider}
                  </span>
                }
              />
              {activeWorkspace.crmProvider && (
                <Field
                  label="CRM"
                  value={
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim font-mono text-[12px]">
                      {activeWorkspace.crmProvider}
                    </span>
                  }
                />
              )}
              {activeWorkspace.routerConfig?.enabled && (
                <Field
                  label="Router multi-agente"
                  value={
                    <span className="inline-flex items-center gap-1.5 text-semantic-green text-[12px] font-semibold">
                      <CheckCircle2 size={12} /> Habilitado
                      <span className="text-creme-faint font-mono">({activeWorkspace.routerConfig.model ?? 'gpt-4o-mini'})</span>
                    </span>
                  }
                />
              )}
              <Field
                label="Credenciais cofre"
                value={
                  <span className="font-mono text-[12px] text-creme-dim">
                    {Object.keys(activeWorkspace.credentials ?? {}).length} chave(s)
                  </span>
                }
              />
            </div>
          ) : (
            <p className="text-[13px] text-creme-faint italic">Cadastre um workspace na aba "Workspaces".</p>
          )}
        </Section>

        {/* ─── Integrações ─────────────────────────────────────────────── */}
        <Section
          icon={<Cable size={14} />}
          title="Integrações"
          subtitle="Conexões externas do sistema"
        >
          <div className="space-y-2.5">
            <IntegrationRow
              name="Supabase"
              url="cloud.supabase.com"
              status={supabaseConnected ? 'ok' : 'off'}
              detail={supabaseConnected ? `Schema: ${env.schema}` : 'Sem credenciais'}
              onTest={() => testIntegration('Supabase')}
              testing={testingIntegration === 'Supabase'}
            />
            <IntegrationRow
              name="Postgres self-hosted (Coolify)"
              url="pg-staging.thribustech.com"
              status="ok"
              detail="thribus_staging · M1+M2+M3"
              onTest={() => testIntegration('PostgREST self-hosted')}
              testing={testingIntegration === 'PostgREST self-hosted'}
            />
            <IntegrationRow
              name="n8n"
              url="thribus.n8n.cloud"
              status="ok"
              detail="Webhooks de tools"
            />
            <IntegrationRow
              name="Evolution API (WhatsApp)"
              url="evolution.thribus.com.br"
              status="warn"
              detail="Conexão por workspace"
            />
            <IntegrationRow
              name="Talki / TexNet CRM"
              url="por workspace"
              status="ok"
              detail={activeWorkspace?.crmProvider ?? 'não configurado'}
            />
          </div>
        </Section>

        {/* ─── Backup automático ────────────────────────────────────────── */}
        <Section
          icon={<HardDrive size={14} />}
          title="Backup automático"
          subtitle="pg_dump diário · 30 dias retenção"
        >
          <div className="space-y-2 text-[13px]">
            <Field
              label="Schedule"
              value={<code className="text-[12px] font-mono text-creme-dim">0 3 * * * (3h diário)</code>}
            />
            <Field
              label="Diretório"
              value={<code className="text-[12px] font-mono text-creme-dim">/var/backups/thribus/postgres/</code>}
            />
            <Field
              label="Formato"
              value={<span className="text-[12px] font-mono text-creme-dim">custom · -Z 9 (max compress)</span>}
            />
            <Field
              label="DBs cobertos"
              value={
                <div className="flex gap-1.5 flex-wrap">
                  {['thribus_staging', 'thribus_prod', 'talki_prod'].map((db) => (
                    <span key={db} className="px-1.5 py-px rounded-full bg-surface-3 text-[11px] font-mono text-creme-dim">
                      {db}
                    </span>
                  ))}
                </div>
              }
            />
            <div className="pt-2 border-t border-default mt-2">
              <p className="text-[12px] text-creme-faint">
                Object Storage Contabo será adicionado quando contratado — upload S3 já está pronto no script, basta descomentar.
              </p>
            </div>
          </div>
        </Section>

        {/* ─── Env vars / runtime ──────────────────────────────────────── */}
        <Section
          icon={<KeyRound size={14} />}
          title="Variáveis de ambiente"
          subtitle="Frontend (Vite) — runtime"
        >
          <div className="space-y-2 text-[13px]">
            <EnvRow
              name="VITE_SUPABASE_URL"
              value={env.supabaseUrl || '(vazio)'}
              onCopy={() => copy(env.supabaseUrl, 'URL Supabase')}
              empty={!env.supabaseUrl}
            />
            <EnvRow
              name="VITE_SUPABASE_ANON_KEY"
              value={env.supabaseKey ? mask(env.supabaseKey, 8) : '(vazio)'}
              onCopy={() => copy(env.supabaseKey, 'Anon key')}
              empty={!env.supabaseKey}
            />
            <EnvRow name="VITE_SUPABASE_SCHEMA" value={env.schema} />
            <EnvRow name="MODE" value={env.mode} />
          </div>
        </Section>
      </div>

      <div className="mt-5 p-4 rounded-[10px] border border-dashed border-default text-[12.5px] text-creme-faint flex items-start gap-2.5">
        <Database size={14} className="text-creme-mute shrink-0 mt-0.5" />
        <div>
          Workspace agora pode ser <span className="font-semibold text-creme-dim">editado pelo botão acima</span>.
          Credenciais são gravadas no Supabase managed e usadas pelo worker em runtime.
          Pra editar diretamente no banco, use o SQL Editor do Supabase ou a skill <code className="font-mono">thribus-db</code>.
        </div>
      </div>

      {showEditWorkspace && activeWorkspace && (
        <WorkspaceEditModal
          workspace={activeWorkspace}
          onClose={() => setShowEditWorkspace(false)}
        />
      )}
    </>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, children, action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="text-brand">{icon}</span>
          <h3 className="text-[14px] font-bold text-creme">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {subtitle && <span className="text-[11.5px] text-creme-faint">{subtitle}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px] uppercase tracking-wider font-bold text-creme-faint">{label}</span>
      <div className="text-right truncate min-w-0">{value}</div>
    </div>
  );
}

function IntegrationRow({
  name, url, status, detail, onTest, testing,
}: {
  name: string;
  url: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
  onTest?: () => void;
  testing?: boolean;
}) {
  const statusColor = {
    ok:   { dot: 'bg-semantic-green',  text: 'text-semantic-green',  Icon: CheckCircle2 },
    warn: { dot: 'bg-semantic-amber',  text: 'text-semantic-amber',  Icon: AlertTriangle },
    off:  { dot: 'bg-semantic-red',    text: 'text-semantic-red',    Icon: XCircle },
  }[status];
  const StatusIcon = statusColor.Icon;
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors group">
      <div className="min-w-0 flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${statusColor.dot} shrink-0 shadow-[0_0_6px_currentColor] ${statusColor.text}`} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-creme">{name}</div>
          <div className="text-[11.5px] text-creme-faint truncate flex items-center gap-1 font-mono">
            <ExternalLink size={9} /> {url}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <div className={`text-[11.5px] font-mono ${statusColor.text} flex items-center gap-1`}>
          <StatusIcon size={11} /> {detail}
        </div>
        {onTest && (
          <button
            onClick={onTest}
            disabled={testing}
            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-md text-[11px] font-semibold text-creme-mute hover:text-creme bg-surface-1 hover:bg-surface-3 transition-all disabled:opacity-50"
            title="Testar conexão"
          >
            {testing ? '...' : 'Testar'}
          </button>
        )}
      </div>
    </div>
  );
}

const STAT_BG: Record<'brand' | 'green' | 'amber', string> = {
  brand: 'from-brand/15 to-brand/5 border-brand/20',
  green: 'from-semantic-green/10 to-transparent border-semantic-green/20',
  amber: 'from-semantic-amber/10 to-transparent border-semantic-amber/20',
};

const STAT_FG: Record<'brand' | 'green' | 'amber', string> = {
  brand: 'text-brand-bright',
  green: 'text-semantic-green',
  amber: 'text-semantic-amber',
};

function SystemStat({
  icon, label, value, sub, accent = 'brand',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'brand' | 'green' | 'amber';
}) {
  return (
    <div className={`bg-gradient-to-br ${STAT_BG[accent]} border rounded-[10px] p-4 transition-all hover:border-hover`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`w-6 h-6 rounded-md bg-surface-1/50 flex items-center justify-center ${STAT_FG[accent]}`}>
          {icon}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-creme-faint font-bold">
          {label}
        </span>
      </div>
      <div className="text-[26px] font-extrabold text-creme tracking-tight font-mono leading-none mb-1">
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-creme-faint">{sub}</div>}
    </div>
  );
}

function EnvRow({
  name, value, onCopy, empty,
}: {
  name: string;
  value: string;
  onCopy?: () => void;
  empty?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-default last:border-0">
      <code className="text-[11.5px] font-mono text-creme-dim shrink-0">{name}</code>
      <div className="flex items-center gap-1.5 min-w-0">
        <code className={`text-[12px] font-mono truncate ${empty ? 'text-semantic-red italic' : 'text-creme'}`}>
          {value}
        </code>
        {onCopy && !empty && (
          <button
            onClick={onCopy}
            className="shrink-0 p-1 rounded hover:bg-surface-hover text-creme-mute hover:text-creme transition-colors"
            title="Copiar"
          >
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
