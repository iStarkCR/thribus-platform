/**
 * Cortex Knowledge — admin pra adicionar docs à base RAG do tenant.
 *
 * Endpoint: POST /cortex/admin/knowledge (gera embedding via OpenAI e persiste)
 */

import { useEffect, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, Check } from 'lucide-react';
import { cortexAdmin, cortexAdminConfigured, type CortexTenant } from '@/services/cortexAdmin';

export function CortexKnowledge() {
  const [tenants, setTenants] = useState<CortexTenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [source, setSource] = useState('manual');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cortexAdminConfigured) return;
    void (async () => {
      try {
        const list = await cortexAdmin.listTenants();
        setTenants(list);
        if (list.length > 0) setTenantId(list[0].id);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  async function submit() {
    if (!tenantId || !text.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await cortexAdmin.addKnowledge({
        tenant_id: tenantId,
        title: title.trim() || undefined,
        text: text.trim(),
        source: source || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        agent_scope: scope
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setSuccess(true);
      setTitle('');
      setText('');
      setTags('');
      setScope('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!cortexAdminConfigured) return null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-8">
        <div className="rounded-xl border border-default bg-surface-1 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-brand" />
            <h3 className="text-[15px] font-bold text-creme">Adicionar à base de conhecimento (RAG)</h3>
          </div>

          <Field label="Tenant">
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
            >
              <option value="">Selecione…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Título (opcional)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
                placeholder="Política de cancelamento"
              />
            </Field>
            <Field label="Fonte">
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono"
                placeholder="manual | notion:page-id"
              />
            </Field>
          </div>

          <Field label="Texto (será vetorizado)">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme font-mono leading-relaxed"
              placeholder="Cole o conteúdo (FAQ, política, procedimento operacional…)"
            />
            <div className="mt-1 text-[11.5px] text-creme-faint">
              {text.length.toLocaleString()} caracteres
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tags (vírgula)">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
                placeholder="faq, financeiro, planos"
              />
            </Field>
            <Field label="Agent scope (vírgula — vazio = todos)">
              <input
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13.5px] text-creme"
                placeholder="bianca, marcos"
              />
            </Field>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/30 px-3 py-2 text-[12.5px] text-red-200 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 px-3 py-2 text-[12.5px] text-emerald-200 flex items-center gap-2">
              <Check size={14} />
              Documento adicionado à base. Embedding gerado e persistido.
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving || !tenantId || !text.trim()}
              className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
              {saving ? 'Vetorizando…' : 'Adicionar à base'}
            </button>
          </div>
        </div>
      </div>

      <aside className="col-span-4">
        <div className="rounded-xl border border-default bg-surface-1 p-5 space-y-3 text-[12.5px] text-creme-mute leading-relaxed">
          <h4 className="text-[13px] font-bold text-creme uppercase tracking-wider">Como funciona</h4>
          <p>
            Cada documento adicionado é dividido em chunks, vetorizado via OpenAI{' '}
            <code className="font-mono">text-embedding-3-small</code> (1536 dims) e persistido em{' '}
            <code className="font-mono">cortex_knowledge</code> com pgvector.
          </p>
          <p>
            Quando o Brain recebe uma pergunta, busca os 5 chunks mais similares e injeta no contexto do
            agente automaticamente (RAG).
          </p>
          <p className="text-creme-faint">
            <strong className="text-creme-mute">Requisitos:</strong>
            <br />
            • OPENAI_API_KEY configurada no worker
            <br />
            • Migration 013 (pgvector) aplicada
          </p>
          <div className="pt-2 border-t border-default">
            <strong className="text-creme-mute block mb-1">Boas práticas:</strong>
            <ul className="space-y-1 list-disc list-inside opacity-90">
              <li>Quebra docs longos em seções de 500-1500 chars</li>
              <li>Use tags pra filtrar contexto (faq, financeiro…)</li>
              <li>Agent scope restringe qual agente vê esse doc</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
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
