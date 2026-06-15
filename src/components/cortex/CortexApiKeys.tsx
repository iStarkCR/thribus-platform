import { useEffect, useState } from 'react';
import { Plus, Loader2, AlertCircle, Key, Copy, Check, Ban } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import {
  cortexAdmin,
  cortexAdminConfigured,
  type CortexApiKey,
  type CortexTenant,
} from '@/services/cortexAdmin';

export function CortexApiKeys() {
  const [tenants, setTenants] = useState<CortexTenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [keys, setKeys] = useState<CortexApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function loadTenants() {
    try {
      const list = await cortexAdmin.listTenants();
      setTenants(list);
      if (list.length > 0 && !selectedTenant) setSelectedTenant(list[0].id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadKeys() {
    if (!selectedTenant) return;
    setLoading(true);
    setError(null);
    try {
      const list = await cortexAdmin.listApiKeys(selectedTenant);
      setKeys(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (cortexAdminConfigured) void loadTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) void loadKeys();
  }, [selectedTenant]);

  if (!cortexAdminConfigured) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">Tenant</span>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme min-w-[200px]"
          >
            <option value="">Selecione…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowNew(true)}
          disabled={!selectedTenant}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} />
          Nova API key
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
        ) : keys.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13.5px] text-creme-mute">
            <Key size={28} className="mx-auto mb-2 opacity-40" />
            {selectedTenant ? 'Nenhuma API key criada ainda.' : 'Selecione um tenant.'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-creme-faint">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Nome</th>
                <th className="text-left px-3 py-2.5 font-bold">Prefixo</th>
                <th className="text-left px-3 py-2.5 font-bold">Scopes</th>
                <th className="text-left px-3 py-2.5 font-bold">Status</th>
                <th className="text-left px-3 py-2.5 font-bold">Último uso</th>
                <th className="text-right px-5 py-2.5 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-3 font-bold text-creme text-[13.5px]">{k.name}</td>
                  <td className="px-3 py-3 font-mono text-[12.5px] text-creme-mute">{k.key_prefix}…</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="text-[10.5px] px-1.5 py-0.5 rounded bg-surface-3 text-creme-faint font-mono"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold text-[11.5px] uppercase ${
                        k.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-red-500/10 text-red-300'
                      }`}
                    >
                      {k.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-creme-faint">
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleString('pt-BR')
                      : 'nunca'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {k.status === 'active' && (
                      <button
                        onClick={async () => {
                          const ok = await useAppStore.getState().askConfirm({ title: 'Revogar API key', message: `Revogar a key "${k.name}"?`, confirmLabel: 'Revogar' });
                          if (!ok) return;
                          try {
                            await cortexAdmin.revokeApiKey(k.id);
                            await loadKeys();
                          } catch (err) {
                            useAppStore.getState().addToast((err as Error).message, 'red');
                          }
                        }}
                        className="text-red-300 hover:text-red-200 text-[12.5px] font-bold flex items-center gap-1 ml-auto"
                      >
                        <Ban size={12} />
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && selectedTenant && (
        <NewApiKeyModal
          tenantId={selectedTenant}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await loadKeys();
          }}
        />
      )}
    </div>
  );
}

function NewApiKeyModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [env, setEnv] = useState<'live' | 'test'>('live');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await cortexAdmin.createApiKey(tenantId, { name: name.trim(), env });
      setRaw(result.raw);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={raw ? 'API key criada' : 'Nova API key'}
      subtitle={
        raw
          ? 'GUARDE essa chave AGORA — não será exibida novamente'
          : 'Identifica a chave por nome — útil pra rotação'
      }
      onClose={() => {
        if (raw) onCreated();
        else onClose();
      }}
      footer={
        raw ? (
          <div className="flex items-center justify-end gap-2 px-6 py-3 bg-surface-2 border-t border-default">
            <button
              onClick={onCreated}
              className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px]"
            >
              OK, guardei
            </button>
          </div>
        ) : (
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
              disabled={saving || !name.trim()}
              className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50"
            >
              {saving ? 'Criando…' : 'Gerar key'}
            </button>
          </div>
        )
      }
    >
      <div className="p-6 space-y-4">
        {raw ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[12.5px] text-amber-200 font-bold">
              ⚠ Essa chave só será exibida AGORA. Cole em um cofre/CI secret antes de fechar.
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-bg border border-hover">
              <code className="flex-1 font-mono text-[12.5px] text-creme break-all">{raw}</code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(raw);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0 px-2 py-1 rounded bg-surface-3 hover:bg-surface-4 text-creme text-[12px] font-bold flex items-center gap-1"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
                Nome
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
                placeholder="Production · Backend"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
                Ambiente
              </span>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as 'live' | 'test')}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
              >
                <option value="live">live (produção)</option>
                <option value="test">test</option>
              </select>
            </label>
            {error && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/30 px-3 py-2 text-[12.5px] text-red-200">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
