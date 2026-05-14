/**
 * Cortex Enterprise — Propostas. UI enxuta com pipeline visual de status.
 */

import { useEffect, useState } from 'react';
import { FileText, Plus, Loader2, AlertCircle, Send, Check, X, Trash } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { cortexEnterprise, type Proposal } from '@/services/cortexEnterprise';

const LS_KEY = 'cortex.playground.apiKey';

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-surface-3 text-creme-mute',
  sent: 'bg-amber-500/10 text-amber-200',
  viewed: 'bg-brand/10 text-brand-bright',
  accepted: 'bg-emerald-500/10 text-emerald-300',
  rejected: 'bg-red-500/10 text-red-200',
  expired: 'bg-red-500/10 text-red-300',
};

export function EnterpriseProposals() {
  const [apiKey, setApiKey] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
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
      const list = await cortexEnterprise.listProposals(apiKey);
      setProposals(list);
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

  async function transition(p: Proposal, action: 'send' | 'mark-viewed' | 'accept' | 'reject') {
    try {
      await cortexEnterprise.updateProposalStatus(apiKey, p.id, action);
      await refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] text-creme-mute">
          {proposals.length} proposta{proposals.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5"
        >
          <Plus size={14} />
          Nova proposta
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
        ) : proposals.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13.5px] text-creme-mute">
            <FileText size={28} className="mx-auto mb-2 opacity-40" />
            Nenhuma proposta ainda.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-creme-faint">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Título</th>
                <th className="text-left px-3 py-2.5 font-bold">Cliente</th>
                <th className="text-left px-3 py-2.5 font-bold">Status</th>
                <th className="text-right px-3 py-2.5 font-bold">Valor</th>
                <th className="text-left px-3 py-2.5 font-bold">Validade</th>
                <th className="text-right px-5 py-2.5 font-bold">Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-3">
                    <div className="font-bold text-creme text-[13.5px]">{p.title}</div>
                    {p.number && (
                      <div className="text-[11.5px] text-creme-faint font-mono">#{p.number}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-creme-mute">{p.client_name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold text-[11.5px] uppercase ${
                        STATUS_CLASS[p.status] ?? 'bg-surface-3 text-creme-mute'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] text-creme">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: p.currency,
                    }).format(p.total_value)}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-creme-mute">{p.valid_until ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {p.status === 'draft' && (
                        <button
                          onClick={() => transition(p, 'send')}
                          className="text-[11.5px] font-bold px-1.5 py-1 rounded bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 flex items-center gap-1"
                          title="Enviar"
                        >
                          <Send size={11} /> Enviar
                        </button>
                      )}
                      {p.status === 'sent' && (
                        <button
                          onClick={() => transition(p, 'mark-viewed')}
                          className="text-[11.5px] font-bold px-1.5 py-1 rounded bg-brand/10 text-brand-bright hover:bg-brand/20"
                          title="Marcar visualizada"
                        >
                          Visualizada
                        </button>
                      )}
                      {(p.status === 'sent' || p.status === 'viewed') && (
                        <>
                          <button
                            onClick={() => transition(p, 'accept')}
                            className="text-[11.5px] font-bold px-1.5 py-1 rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-1"
                          >
                            <Check size={11} /> Aceitar
                          </button>
                          <button
                            onClick={() => transition(p, 'reject')}
                            className="text-[11.5px] font-bold px-1.5 py-1 rounded bg-red-500/10 text-red-200 hover:bg-red-500/20 flex items-center gap-1"
                          >
                            <X size={11} /> Rejeitar
                          </button>
                        </>
                      )}
                      {p.status === 'draft' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Apagar proposta "${p.title}"?`)) return;
                            try {
                              await cortexEnterprise.deleteProposal(apiKey, p.id);
                              await refresh();
                            } catch (err) {
                              alert((err as Error).message);
                            }
                          }}
                          className="text-[11.5px] font-bold text-red-300 hover:text-red-200 p-1"
                        >
                          <Trash size={11} />
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
        <NewProposalModal
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

interface FormItem {
  description: string;
  qty: string;
  unit_price: string;
}

function NewProposalModal({
  apiKey,
  onClose,
  onCreated,
}: {
  apiKey: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [summary, setSummary] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<FormItem[]>([
    { description: '', qty: '1', unit_price: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce(
    (acc, i) => acc + (Number(i.qty) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  async function submit() {
    if (!title.trim() || !clientName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await cortexEnterprise.createProposal(apiKey, {
        title: title.trim(),
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        summary,
        valid_until: validUntil || null,
        items: items
          .filter((i) => i.description.trim())
          .map((i) => {
            const qty = Number(i.qty) || 0;
            const unit_price = Number(i.unit_price) || 0;
            return {
              description: i.description.trim(),
              qty,
              unit_price,
              subtotal: qty * unit_price,
            };
          }),
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nova proposta"
      subtitle="Rascunho — pode enviar depois"
      onClose={onClose}
      maxWidth="780px"
      footer={
        <div className="flex justify-between items-center gap-2 px-6 py-3 bg-surface-2 border-t border-default">
          <div className="text-[13px] font-bold text-creme">
            Total:{' '}
            <span className="text-brand-bright">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-[13px] font-bold text-creme-mute hover:text-creme"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={saving || !title.trim() || !clientName.trim()}
              className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50"
            >
              {saving ? 'Criando…' : 'Criar proposta'}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Título">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
          <Field label="Validade">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cliente">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            />
          </Field>
        </div>

        <Field label="Resumo (1-2 linhas)">
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
          />
        </Field>

        <div>
          <div className="text-[11.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">
            Itens
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  value={item.description}
                  onChange={(e) =>
                    setItems(items.map((it, j) => (j === i ? { ...it, description: e.target.value } : it)))
                  }
                  placeholder="Descrição"
                  className="col-span-6 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme"
                />
                <input
                  value={item.qty}
                  onChange={(e) =>
                    setItems(
                      items.map((it, j) =>
                        j === i ? { ...it, qty: e.target.value.replace(/[^0-9.]/g, '') } : it,
                      ),
                    )
                  }
                  placeholder="Qtd"
                  className="col-span-2 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme font-mono"
                />
                <input
                  value={item.unit_price}
                  onChange={(e) =>
                    setItems(
                      items.map((it, j) =>
                        j === i ? { ...it, unit_price: e.target.value.replace(/[^0-9.]/g, '') } : it,
                      ),
                    )
                  }
                  placeholder="Preço un."
                  className="col-span-3 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme font-mono"
                />
                <button
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  disabled={items.length === 1}
                  className="col-span-1 text-creme-faint hover:text-red-300 disabled:opacity-30"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setItems([...items, { description: '', qty: '1', unit_price: '' }])}
            className="mt-2 text-[12.5px] font-bold text-brand-bright hover:text-brand flex items-center gap-1"
          >
            <Plus size={12} />
            Adicionar item
          </button>
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
