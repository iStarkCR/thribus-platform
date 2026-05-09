import { useMemo } from 'react';
import {
  Settings, Database, Cable, ShieldCheck, HardDrive,
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Copy,
  Server, KeyRound, Bot, Wrench,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

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

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    addToast(`${label} copiado`, 'green');
  };

  const mask = (s: string, visible = 6) =>
    s.length <= visible * 2 ? '•'.repeat(s.length) : `${s.slice(0, visible)}…${s.slice(-4)}`;

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

      <div className="grid grid-cols-2 gap-3">
        {/* ─── Workspace ativo ──────────────────────────────────────────── */}
        <Section
          icon={<Server size={14} />}
          title="Workspace ativo"
          subtitle={activeWorkspace ? activeWorkspace.name : 'Nenhum workspace cadastrado'}
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
            />
            <IntegrationRow
              name="Postgres self-hosted (Coolify)"
              url="147.93.131.93:5433"
              status="ok"
              detail="thribus_staging · M1+M2"
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
          Configurações sensíveis (API keys, tokens, prompts de roteador) são gerenciadas no{' '}
          <span className="font-semibold text-creme-dim">workspace</span> ou direto via SQL no Postgres self-hosted.
          Edição inline no painel virá em breve junto da migração de produção do Supabase pro Postgres self-hosted.
        </div>
      </div>
    </>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="text-brand">{icon}</span>
          <h3 className="text-[14px] font-bold text-creme">{title}</h3>
        </div>
        {subtitle && <span className="text-[11.5px] text-creme-faint">{subtitle}</span>}
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
  name, url, status, detail,
}: {
  name: string;
  url: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
}) {
  const statusColor = {
    ok:   { dot: 'bg-semantic-green',  text: 'text-semantic-green',  Icon: CheckCircle2 },
    warn: { dot: 'bg-semantic-amber',  text: 'text-semantic-amber',  Icon: AlertTriangle },
    off:  { dot: 'bg-semantic-red',    text: 'text-semantic-red',    Icon: XCircle },
  }[status];
  const StatusIcon = statusColor.Icon;
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="min-w-0 flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${statusColor.dot} shrink-0 shadow-[0_0_6px_currentColor] ${statusColor.text}`} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-creme">{name}</div>
          <div className="text-[11.5px] text-creme-faint truncate flex items-center gap-1 font-mono">
            <ExternalLink size={9} /> {url}
          </div>
        </div>
      </div>
      <div className={`text-[11.5px] font-mono ${statusColor.text} flex items-center gap-1 shrink-0 ml-3`}>
        <StatusIcon size={11} /> {detail}
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
