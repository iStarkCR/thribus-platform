/**
 * Cortex Enterprise — página principal da suíte.
 *
 * Tabs: Visão geral · Contratos · Propostas · Talki · Thribus BI · Assinatura
 */

import { useState } from 'react';
import {
  LayoutDashboard,
  FileSignature,
  FileText,
  MessageSquare,
  BarChart3,
  CreditCard,
} from 'lucide-react';
import { clsx } from 'clsx';
import { EnterpriseOverview } from '@/components/enterprise/EnterpriseOverview';
import { EnterpriseContracts } from '@/components/enterprise/EnterpriseContracts';
import { EnterpriseProposals } from '@/components/enterprise/EnterpriseProposals';
import { EnterpriseTalki } from '@/components/enterprise/EnterpriseTalki';
import { EnterpriseBI } from '@/components/enterprise/EnterpriseBI';
import { EnterpriseBilling } from '@/components/enterprise/EnterpriseBilling';

type Tab = 'overview' | 'contracts' | 'proposals' | 'talki' | 'bi' | 'billing';

const TABS: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'contracts', label: 'Contratos', icon: FileSignature },
  { id: 'proposals', label: 'Propostas', icon: FileText },
  { id: 'talki', label: 'Talki', icon: MessageSquare },
  { id: 'bi', label: 'Thribus BI', icon: BarChart3 },
  { id: 'billing', label: 'Assinatura', icon: CreditCard },
];

export function CortexEnterprisePage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-creme tracking-tight">Cortex Enterprise</h1>
        <p className="text-sm text-creme-mute mt-1">
          Suíte completa: cérebro multi-agente + colaboradores digitais + módulos empresariais.
        </p>
      </div>

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

      <div>
        {tab === 'overview' && <EnterpriseOverview />}
        {tab === 'contracts' && <EnterpriseContracts />}
        {tab === 'proposals' && <EnterpriseProposals />}
        {tab === 'talki' && <EnterpriseTalki />}
        {tab === 'bi' && <EnterpriseBI />}
        {tab === 'billing' && <EnterpriseBilling />}
      </div>
    </div>
  );
}
