import { useEffect, useState } from 'react';
import { Plus, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import {
  cortexAdmin,
  cortexAdminConfigured,
  type CortexTenant,
} from '@/services/cortexAdmin';

export function CortexTenants() {
  const [tenants, setTenants] = useState<CortexTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const list = await cortexAdmin.listTenants();
      setTenants(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (cortexAdminConfigured) void refresh();
    else setLoading(false);
  }, []);

  if (!cortexAdminConfigured) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] text-creme-mute">
          {tenants.length} tenant{tenants.length === 1 ? '' : 's'} cadastrado
          {tenants.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5"
        >
          <Plus size={14} />
          Novo tenant
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-center">
            <Loader2 size={18} className="mx-auto text-creme-mute animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13.5px] text-creme-mute">
            <Building2 size={28} className="mx-auto mb-2 opacity-40" />
            Nenhum tenant cadastrado ainda.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-creme-faint">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Nome</th>
                <th className="text-left px-3 py-2.5 font-bold">Slug</th>
                <th className="text-left px-3 py-2.5 font-bold">Plano</th>
                <th className="text-left px-3 py-2.5 font-bold">Status</th>
                <th className="text-left px-3 py-2.5 font-bold">Workspace</th>
                <th className="text-left px-3 py-2.5 font-bold">Limites</th>
                <th className="text-left px-5 py-2.5 font-bold">Criado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-3 font-bold text-creme text-[13.5px]">{t.name}</td>
                  <td className="px-3 py-3 font-mono text-[12.5px] text-creme-mute">{t.slug}</td>
                  <td className="px-3 py-3 text-[13px]">
                    <span className="px-1.5 py-0.5 rounded bg-brand/10 text-brand-bright font-bold text-[11.5px] uppercase">
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-3 py-3 font-mono text-[11.5px] text-creme-faint">
                    {t.workspace_id?.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-creme-mute">
                    {t.monthly_message_limit ? `${t.monthly_message_limit.toLocaleString()} msgs` : '—'}
                    {t.monthly_cost_limit_usd ? ` · $${t.monthly_cost_limit_usd}` : ''}
                  </td>
                  <td className="px-5 py-3 text-[12px] text-creme-faint">
                    {new Date(t.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewTenantModal
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-300',
    trial: 'bg-amber-500/10 text-amber-300',
    suspended: 'bg-red-500/10 text-red-300',
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded font-bold text-[11.5px] uppercase ${
        map[status] ?? 'bg-surface-3 text-creme-mute'
      }`}
    >
      {status}
    </span>
  );
}

function NewTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('starter');
  const [workspaceId, setWorkspaceId] = useState('');
  const [msgLimit, setMsgLimit] = useState('');
  const [costLimit, setCostLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await cortexAdmin.createTenant({
        name: name.trim(),
        slug: slug.trim(),
        plan,
        workspace_id: workspaceId.trim() || undefined,
        monthly_message_limit: msgLimit ? Number(msgLimit) : undefined,
        monthly_cost_limit_usd: costLimit ? Number(costLimit) : undefined,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Novo tenant Cortex"
      subtitle="Cliente da plataforma multi-agente"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2 px-6 py-3 bg-surface-2 border-t border-default">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[13px] font-bold text-creme-mute hover:text-creme"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !slug.trim()}
            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50"
          >
            {saving ? 'Criando…' : 'Criar tenant'}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Nome">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            placeholder="TexNet Provedor"
          />
        </Field>
        <Field label="Slug (url-friendly)">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
            placeholder="texnet"
          />
        </Field>
        <Field label="Plano">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
          >
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="scale">Scale</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Field>
        <Field label="Workspace ID (legacy — opcional)">
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
            placeholder="uuid do workspace existente"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite mensal (msgs)">
            <input
              value={msgLimit}
              onChange={(e) => setMsgLimit(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
              placeholder="ex: 50000"
            />
          </Field>
          <Field label="Limite mensal (USD)">
            <input
              value={costLimit}
              onChange={(e) => setCostLimit(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
              placeholder="ex: 100"
            />
          </Field>
        </div>
        {error && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/30 px-3 py-2 text-[12.5px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
