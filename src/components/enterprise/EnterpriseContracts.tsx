/**
 * Cortex Enterprise — Contratos. Usa a API key salva no playground.
 */

import { useEffect, useState } from 'react';
import {
  FileSignature,
  Plus,
  Loader2,
  AlertCircle,
  Pen,
  Check,
  Trash,
} from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import {
  cortexEnterprise,
  type Contract,
} from '@/services/cortexEnterprise';

const LS_KEY = 'cortex.playground.apiKey';

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-surface-3 text-creme-mute',
  sent: 'bg-amber-500/10 text-amber-200',
  signed: 'bg-emerald-500/10 text-emerald-300',
  active: 'bg-brand/10 text-brand-bright',
  expired: 'bg-red-500/10 text-red-200',
  canceled: 'bg-red-500/10 text-red-300',
};

export function EnterpriseContracts() {
  const [apiKey, setApiKey] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setApiKey(stored);
  }, []);

  async function refresh() {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const list = await cortexEnterprise.listContracts(apiKey);
      setContracts(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (apiKey) void refresh();
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 text-[13.5px] text-amber-200">
        Configure a API key no <strong>Cortex Brain → Playground</strong> primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] text-creme-mute">
          {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5"
        >
          <Plus size={14} />
          Novo contrato
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-center">
            <Loader2 size={18} className="mx-auto text-creme-mute animate-spin" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13.5px] text-creme-mute">
            <FileSignature size={28} className="mx-auto mb-2 opacity-40" />
            Nenhum contrato ainda.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-creme-faint">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Título</th>
                <th className="text-left px-3 py-2.5 font-bold">Parte</th>
                <th className="text-left px-3 py-2.5 font-bold">Status</th>
                <th className="text-right px-3 py-2.5 font-bold">Valor</th>
                <th className="text-left px-3 py-2.5 font-bold">Vigência</th>
                <th className="text-right px-5 py-2.5 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-3">
                    <div className="font-bold text-creme text-[13.5px]">{c.title}</div>
                    {c.number && (
                      <div className="text-[11.5px] text-creme-faint font-mono">#{c.number}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-creme-mute">
                    {c.party_name}
                    {c.party_document && (
                      <div className="text-[11.5px] text-creme-faint font-mono">
                        {c.party_document}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold text-[11.5px] uppercase ${
                        STATUS_CLASS[c.status] ?? 'bg-surface-3 text-creme-mute'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] text-creme">
                    {c.total_value
                      ? new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: c.currency,
                        }).format(c.total_value)
                      : '—'}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-creme-mute">
                    {c.starts_on ?? '—'} {c.ends_on && `→ ${c.ends_on}`}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {c.status === 'draft' && (
                        <button
                          onClick={async () => {
                            const ok = await useAppStore.getState().askConfirm({ title: 'Assinar contrato', message: 'Marcar este contrato como assinado?', confirmLabel: 'Assinar', danger: false });
                            if (!ok) return;
                            try {
                              await cortexEnterprise.signContract(apiKey, c.id);
                              await refresh();
                            } catch (err) {
                              useAppStore.getState().addToast((err as Error).message, 'red');
                            }
                          }}
                          className="text-[12px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                        >
                          <Check size={12} />
                          Assinar
                        </button>
                      )}
                      {c.status === 'draft' && (
                        <button
                          onClick={async () => {
                            const ok = await useAppStore.getState().askConfirm({ title: 'Apagar contrato', message: `Apagar o contrato "${c.title}"?`, confirmLabel: 'Apagar' });
                            if (!ok) return;
                            try {
                              await cortexEnterprise.deleteContract(apiKey, c.id);
                              await refresh();
                            } catch (err) {
                              useAppStore.getState().addToast((err as Error).message, 'red');
                            }
                          }}
                          className="text-[12px] font-bold text-red-300 hover:text-red-200 flex items-center gap-1"
                        >
                          <Trash size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewContractModal
          apiKey={apiKey}
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

function NewContractModal({
  apiKey,
  onClose,
  onCreated,
}: {
  apiKey: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyDoc, setPartyDoc] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [value, setValue] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !partyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await cortexEnterprise.createContract(apiKey, {
        title: title.trim(),
        number: number.trim() || null,
        party_name: partyName.trim(),
        party_document: partyDoc.trim() || null,
        party_email: partyEmail.trim() || null,
        total_value: value ? Number(value) : null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        body_md: bodyMd,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Novo contrato"
      subtitle="Criar contrato em rascunho"
      onClose={onClose}
      maxWidth="720px"
      footer={
        <div className="flex justify-end gap-2 px-6 py-3 bg-surface-2 border-t border-default">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[13px] font-bold text-creme-mute hover:text-creme"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim() || !partyName.trim()}
            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50 flex items-center gap-1.5"
          >
            <Pen size={13} />
            {saving ? 'Criando…' : 'Criar contrato'}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Título" className="col-span-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
          <Field label="Número">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
              placeholder="2026-001"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Parte (cliente)" className="col-span-2">
            <input
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
          <Field label="CNPJ/CPF">
            <input
              value={partyDoc}
              onChange={(e) => setPartyDoc(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
            />
          </Field>
        </div>

        <Field label="E-mail da parte">
          <input
            value={partyEmail}
            onChange={(e) => setPartyEmail(e.target.value)}
            type="email"
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Valor (BRL)">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
              placeholder="0.00"
            />
          </Field>
          <Field label="Início">
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
          <Field label="Fim">
            <input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
        </div>

        <Field label="Cláusulas (markdown)">
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono leading-relaxed"
            placeholder="## Objeto do contrato\nPrestação de serviços de..."
          />
        </Field>

        {error && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/30 px-3 py-2 text-[12.5px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
