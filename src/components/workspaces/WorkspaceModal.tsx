import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import type { Workspace, LLMProvider, CRMProvider } from '@/types';

interface Props {
  workspace?: Workspace;
  onClose: () => void;
}

interface CredentialEntry {
  key: string;
  value: string;
}

function recordToEntries(rec: Record<string, string> | undefined): CredentialEntry[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function entriesToRecord(entries: CredentialEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

export function WorkspaceModal({ workspace, onClose }: Props) {
  const isEdit = !!workspace;
  const { createWorkspace, updateWorkspace, deleteWorkspace, addToast } = useAppStore();

  const [name, setName] = useState(workspace?.name ?? '');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(workspace?.llmProvider ?? 'openai');
  const [llmApiKey, setLlmApiKey] = useState(workspace?.llmApiKey ?? '');
  const [crmProvider, setCrmProvider] = useState<CRMProvider | ''>(workspace?.crmProvider ?? '');
  const [crmBaseUrl, setCrmBaseUrl] = useState(workspace?.crmBaseUrl ?? '');
  const [crmAccountId, setCrmAccountId] = useState(workspace?.crmAccountId ?? '');
  const [crmApiToken, setCrmApiToken] = useState(workspace?.crmApiToken ?? '');
  const [texnetBotSenderId, setTexnetBotSenderId] = useState(workspace?.texnetBotSenderId ?? '');
  const [talkiRequiredLabel, setTalkiRequiredLabel] = useState(workspace?.talkiRequiredLabel ?? '');
  const [credentials, setCredentials] = useState<CredentialEntry[]>(
    recordToEntries(workspace?.credentials),
  );
  const [loading, setLoading] = useState(false);

  const addCredential = () => setCredentials([...credentials, { key: '', value: '' }]);
  const updateCredential = (idx: number, patch: Partial<CredentialEntry>) => {
    setCredentials(credentials.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeCredential = (idx: number) =>
    setCredentials(credentials.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Informe o nome do workspace', 'amber');
      return;
    }
    // Valida credenciais — keys precisam ser únicas
    const credsRecord = entriesToRecord(credentials);
    const declaredKeys = credentials.map((c) => c.key.trim()).filter(Boolean);
    if (new Set(declaredKeys).size !== declaredKeys.length) {
      addToast('Há credenciais com a mesma chave. Renomeie pra evitar sobrescrita.', 'amber');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        llmProvider,
        llmApiKey: llmApiKey.trim() || undefined,
        crmProvider: crmProvider || undefined,
        crmBaseUrl: crmBaseUrl.trim() || undefined,
        crmAccountId: crmAccountId.trim() || undefined,
        crmApiToken: crmApiToken.trim() || undefined,
        texnetBotSenderId: texnetBotSenderId.trim() || undefined,
        talkiRequiredLabel: talkiRequiredLabel.trim() || undefined,
        credentials: credsRecord,
      };
      if (isEdit && workspace) {
        await updateWorkspace(workspace.id, payload);
      } else {
        await createWorkspace(payload);
      }
      onClose();
    } catch {
      addToast('Erro ao salvar workspace', 'red');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workspace) return;
    if (!confirm(`Remover "${workspace.name}"? Agents vinculados ficam sem workspace.`)) return;
    setLoading(true);
    try {
      await deleteWorkspace(workspace.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? `Workspace — ${workspace.name}` : 'Novo Workspace'}
      subtitle="Credenciais isoladas por cliente. Cada workspace usa suas próprias keys de LLM/CRM."
      onClose={onClose}
      maxWidth="700px"
      footer={
        <>
          {isEdit && (
            <button className="btn btn-danger mr-auto" onClick={handleDelete} disabled={loading}>
              <Trash2 size={13} /> Remover
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-accent" onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Workspace'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
            Nome do Workspace
          </label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Texnet, Provedor X" />
        </div>

        <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright pt-2">LLM</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Provider</label>
            <select className="input" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              API Key (opcional)
            </label>
            <input
              className="input font-mono"
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="sk-... (deixa vazio pra usar env)"
            />
          </div>
        </div>

        <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright pt-2">CRM</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Provider</label>
            <select className="input" value={crmProvider} onChange={(e) => setCrmProvider(e.target.value as CRMProvider | '')}>
              <option value="">— nenhum (usa env) —</option>
              <option value="talki">Talki / Chatwoot</option>
              <option value="texnet">TexNet CRM</option>
            </select>
          </div>
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Base URL</label>
            <input
              className="input font-mono"
              value={crmBaseUrl}
              onChange={(e) => setCrmBaseUrl(e.target.value)}
              placeholder="https://talki.thribustech.com"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Account ID</label>
            <input className="input font-mono" value={crmAccountId} onChange={(e) => setCrmAccountId(e.target.value)} placeholder="5" />
          </div>
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">API Token</label>
            <input
              className="input font-mono"
              type="password"
              value={crmApiToken}
              onChange={(e) => setCrmApiToken(e.target.value)}
              placeholder="token (vazio = env)"
            />
          </div>
        </div>

        {crmProvider === 'talki' && (
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Talki — Label obrigatória
            </label>
            <input
              className="input font-mono"
              value={talkiRequiredLabel}
              onChange={(e) => setTalkiRequiredLabel(e.target.value)}
              placeholder="testando-agente (vazio = sem requisito)"
            />
            <p className="text-[12px] text-creme-faint mt-1">
              Bot só responde em conversas com essa label. Vazio = todas.
            </p>
          </div>
        )}

        {crmProvider === 'texnet' && (
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              TexNet — Bot Sender ID
            </label>
            <input
              className="input font-mono"
              value={texnetBotSenderId}
              onChange={(e) => setTexnetBotSenderId(e.target.value)}
              placeholder="UUID do user TexNet usado como sender"
            />
          </div>
        )}

        <div className="text-[12px] font-bold uppercase tracking-widest text-brand-bright pt-2">
          Credenciais de Integração
        </div>
        <p className="text-[12.5px] text-creme-faint -mt-2">
          Tokens, hashes, API keys que as <span className="font-mono">tools</span> deste workspace
          podem usar. Cada tool referencia pelo nome simbólico (ex:{' '}
          <span className="font-mono">ixc_token</span>).
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
              Pares chave / valor
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addCredential}>
              <Plus size={12} /> Adicionar
            </button>
          </div>
          {credentials.length === 0 ? (
            <div className="text-[13px] text-creme-faint italic px-3 py-2 bg-surface-2 border border-default rounded-lg">
              Nenhuma credencial cadastrada. Tools sem auth funcionam normalmente.
            </div>
          ) : (
            <div className="space-y-2">
              {credentials.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center bg-surface-2 border border-default rounded-lg p-2"
                >
                  <input
                    className="input font-mono text-[13px]"
                    value={c.key}
                    onChange={(e) =>
                      updateCredential(i, { key: e.target.value.replace(/\s+/g, '_') })
                    }
                    placeholder="ex: ixc_token"
                  />
                  <input
                    className="input font-mono text-[13px]"
                    type="password"
                    value={c.value}
                    onChange={(e) => updateCredential(i, { value: e.target.value })}
                    placeholder="valor (token, hash, key)"
                  />
                  <button
                    type="button"
                    className="text-creme-faint hover:text-semantic-red transition-colors p-1"
                    onClick={() => removeCredential(i)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
