/**
 * Cortex Brain — página principal do painel admin.
 *
 * Tabs: Visão geral · Tenants · API Keys · Playground · Métricas
 */

import { useState } from 'react';
import { Brain, Building2, Key, Play, Activity, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { cortexAdminConfigured } from '@/services/cortexAdmin';
import { CortexOverview } from '@/components/cortex/CortexOverview';
import { CortexTenants } from '@/components/cortex/CortexTenants';
import { CortexApiKeys } from '@/components/cortex/CortexApiKeys';
import { CortexPlayground } from '@/components/cortex/CortexPlayground';
import { CortexMetrics } from '@/components/cortex/CortexMetrics';
import { CortexKnowledge } from '@/components/cortex/CortexKnowledge';

type Tab =
  | 'overview'
  | 'tenants'
  | 'api-keys'
  | 'playground'
  | 'metrics'
  | 'knowledge';

const TABS: Array<{ id: Tab; label: string; icon: typeof Brain }> = [
  { id: 'overview', label: 'Visão geral', icon: Brain },
  { id: 'tenants', label: 'Tenants', icon: Building2 },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'knowledge', label: 'Conhecimento (RAG)', icon: BookOpen },
  { id: 'playground', label: 'Playground', icon: Play },
  { id: 'metrics', label: 'Métricas', icon: Activity },
];

export function CortexPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-creme tracking-tight">Cortex Brain</h1>
          <p className="text-sm text-creme-mute mt-1">
            Painel admin do cérebro multi-agente. Tenants, API keys, conhecimento e métricas em tempo real.
          </p>
        </div>
      </div>

      {/* Aviso config */}
      {!cortexAdminConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13.5px] text-amber-200">
          <strong className="font-bold">Configuração pendente.</strong>{' '}
          Adicione no <code className="font-mono">.env.local</code>:
          <pre className="mt-2 text-[12px] font-mono opacity-90">
{`VITE_CORTEX_BASE_URL=https://seu-worker.com.br
VITE_CORTEX_ADMIN_SECRET=<mesmo valor de ADMIN_SECRET no worker>`}
          </pre>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-default flex gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'px-3.5 py-2.5 text-[13.5px] font-semibold flex items-center gap-2 border-b-2 transition-colors -mb-px',
                active
                  ? 'text-brand-bright border-brand'
                  : 'text-creme-mute border-transparent hover:text-creme-dim',
              )}
            >
              <Icon size={14} className={active ? 'opacity-100' : 'opacity-50'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {tab === 'overview' && <CortexOverview />}
        {tab === 'tenants' && <CortexTenants />}
        {tab === 'api-keys' && <CortexApiKeys />}
        {tab === 'knowledge' && <CortexKnowledge />}
        {tab === 'playground' && <CortexPlayground />}
        {tab === 'metrics' && <CortexMetrics />}
      </div>
    </div>
  );
}
