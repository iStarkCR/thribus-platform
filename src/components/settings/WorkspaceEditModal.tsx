import { useState } from 'react';
import { X, Server, Cable, KeyRound } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import type { Workspace, LLMProvider, CRMProvider } from '@/types';

/**
 * Modal pra editar config básica do workspace ativo.
 *
 * Edita: nome, llm_provider, llm_api_key, crm_provider, crm_base_url,
 * crm_api_token, texnet_bot_sender_id, talki_required_label.
 *
 * NÃO edita: credentials (cofre — gerencia separado), router_config
 * (M2 — modal próprio futuro).
 *
 * IMPORTANTE: senhas/keys estão visíveis no form — assumindo que quem
 * acessa o painel é admin do workspace. Quando GoTrue entrar (próxima
 * sessão), vamos gatear isso por role.
 */
interface Props {
  workspace: Workspace;
  onClose: () => void;
}

export function WorkspaceEditModal({ workspace, onClose }: Props) {
  const updateWorkspace = useAppStore((s) => s.updateWorkspace);

  const [name, setName] = useState(workspace.name);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(workspace.llmProvider);
  const [llmApiKey, setLlmApiKey] = useState(workspace.llmApiKey ?? '');
  const [crmProvider, setCrmProvider] = useState<CRMProvider | ''>(workspace.crmProvider ?? '');
  const [crmBaseUrl, setCrmBaseUrl] = useState(workspace.crmBaseUrl ?? '');
  const [crmApiToken, setCrmApiToken] = useState(workspace.crmApiToken ?? '');
  const [texnetBotSenderId, setTexnetBotSenderId] = useState(workspace.texnetBotSenderId ?? '');
  const [talkiRequiredLabel, setTalkiRequiredLabel] = useState(workspace.talkiRequiredLabel ?? '');

  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, {
        name,
        llmProvider,
        llmApiKey: llmApiKey || undefined,
        crmProvider: (crmProvider as CRMProvider) || undefined,
        crmBaseUrl: crmBaseUrl || undefined,
        crmApiToken: crmApiToken || undefined,
        texnetBotSenderId: texnetBotSenderId || undefined,
        talkiRequiredLabel: talkiRequiredLabel || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-default rounded-[12px] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Server size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">Editar Workspace</h2>
              <p className="text-[12.5px] text-creme-faint font-mono">{workspace.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center text-creme-mute hover:text-creme transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Nome */}
            <Field label="Nome">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme focus:outline-none focus:border-brand"
              />
            </Field>

            {/* LLM Provider + Key */}
            <div className="bg-surface-2 rounded-lg p-4 space-y-3 border border-default">
              <div className="text-[12px] uppercase tracking-wider font-bold text-creme-faint flex items-center gap-1.5">
                <KeyRound size={11} /> LLM Provider
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider" inline>
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme focus:outline-none focus:border-brand"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </Field>
                <Field label="API Key" inline>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={llmProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                  />
                </Field>
              </div>
            </div>

            {/* CRM */}
            <div className="bg-surface-2 rounded-lg p-4 space-y-3 border border-default">
              <div className="text-[12px] uppercase tracking-wider font-bold text-creme-faint flex items-center gap-1.5">
                <Cable size={11} /> CRM Integration
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider" inline>
                  <select
                    value={crmProvider}
                    onChange={(e) => setCrmProvider(e.target.value as CRMProvider | '')}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme focus:outline-none focus:border-brand"
                  >
                    <option value="">— nenhum —</option>
                    <option value="texnet">TexNet</option>
                    <option value="talki">Talki/Chatwoot</option>
                  </select>
                </Field>
                <Field label="Base URL" inline>
                  <input
                    type="url"
                    value={crmBaseUrl}
                    onChange={(e) => setCrmBaseUrl(e.target.value)}
                    placeholder="https://texcrm.texnet.com.br/api/v1"
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                  />
                </Field>
              </div>
              <Field label="API Token">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={crmApiToken}
                  onChange={(e) => setCrmApiToken(e.target.value)}
                  placeholder={crmProvider === 'texnet' ? 'txn_...' : 'token-aqui'}
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                />
              </Field>
              {crmProvider === 'texnet' && (
                <Field label="TexNet Bot Sender ID">
                  <input
                    type="text"
                    value={texnetBotSenderId}
                    onChange={(e) => setTexnetBotSenderId(e.target.value)}
                    placeholder="33ccee4d-..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                  />
                </Field>
              )}
              {crmProvider === 'talki' && (
                <Field label="Talki Required Label">
                  <input
                    type="text"
                    value={talkiRequiredLabel}
                    onChange={(e) => setTalkiRequiredLabel(e.target.value)}
                    placeholder="bot-ativo"
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand"
                  />
                </Field>
              )}
            </div>

            {/* Toggle revelar secrets */}
            <label className="flex items-center gap-2 text-[12.5px] text-creme-mute cursor-pointer hover:text-creme transition-colors">
              <input
                type="checkbox"
                checked={showSecrets}
                onChange={(e) => setShowSecrets(e.target.checked)}
                className="accent-brand"
              />
              Revelar API keys (cuidado em telas compartilhadas)
            </label>
          </div>

          <div className="px-6 py-4 border-t border-default flex items-center justify-end gap-2 shrink-0 bg-surface-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand transition-all disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div>
      <label className={`block text-[11px] uppercase tracking-wider font-bold text-creme-faint mb-1 ${inline ? '' : ''}`}>
        {label}
      </label>
      {children}
    </div>
  );
}
