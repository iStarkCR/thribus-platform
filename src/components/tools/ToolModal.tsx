import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import type { Tool, ToolAuthCredentials, ToolAuthType, ToolParameter } from '@/types';

interface Props {
  tool?: Tool;
  onClose: () => void;
}

type HttpMethod = Tool['method'];
type ParamType = ToolParameter['type'];
type AuthMode = ToolAuthType | 'none';

interface HeaderEntry {
  key: string;
  value: string;
}

function headersToEntries(rec: Record<string, string> | undefined): HeaderEntry[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

export function ToolModal({ tool, onClose }: Props) {
  const isEdit = !!tool;
  const { createTool, updateTool, deleteTool, addToast, agents } = useAppStore();

  const [name, setName] = useState(tool?.name ?? '');
  const [description, setDescription] = useState(tool?.description ?? '');
  const [endpoint, setEndpoint] = useState(tool?.endpoint ?? '');
  const [method, setMethod] = useState<HttpMethod>(tool?.method ?? 'POST');
  const [scope, setScope] = useState(tool?.scope ?? 'global');
  const [active, setActive] = useState(tool?.active ?? true);
  const [parameters, setParameters] = useState<ToolParameter[]>(tool?.parameters ?? []);
  const [authMode, setAuthMode] = useState<AuthMode>(tool?.authType ?? 'none');
  const [authCreds, setAuthCreds] = useState<ToolAuthCredentials>(tool?.authCredentials ?? {});
  const [extraHeaders, setExtraHeaders] = useState<HeaderEntry[]>(
    headersToEntries(tool?.extraHeaders),
  );
  const [loading, setLoading] = useState(false);

  const updateAuthCred = (patch: Partial<ToolAuthCredentials>) =>
    setAuthCreds({ ...authCreds, ...patch });

  const addHeader = () => setExtraHeaders([...extraHeaders, { key: '', value: '' }]);
  const updateHeader = (idx: number, patch: Partial<HeaderEntry>) => {
    setExtraHeaders(extraHeaders.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };
  const removeHeader = (idx: number) =>
    setExtraHeaders(extraHeaders.filter((_, i) => i !== idx));

  // Sugestões de escopo: clientes existentes + "global"
  const scopeSuggestions = Array.from(
    new Set(['global', ...agents.map((a) => a.client)]),
  );

  const addParam = () => {
    setParameters([...parameters, { name: '', type: 'string', required: false, description: '' }]);
  };

  const updateParam = (idx: number, patch: Partial<ToolParameter>) => {
    setParameters(parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeParam = (idx: number) => {
    setParameters(parameters.filter((_, i) => i !== idx));
  };

  const validate = () => {
    if (!name.trim()) return 'Informe o nome da ferramenta';
    if (!/^[a-z0-9_]+$/.test(name)) return 'Nome deve usar apenas letras minúsculas, números e _';
    if (!description.trim()) return 'Informe a descrição';
    if (!endpoint.trim()) return 'Informe o endpoint';
    if (parameters.some((p) => !p.name.trim())) return 'Todo parâmetro precisa de nome';
    return null;
  };

  const validateAuth = (): string | null => {
    if (authMode === 'none') return null;
    if (authMode === 'basic') {
      if (!authCreds.usernameRef?.trim() || !authCreds.passwordRef?.trim()) {
        return 'Auth Basic: informe os refs de username e password';
      }
    }
    if (authMode === 'bearer') {
      if (!authCreds.tokenRef?.trim()) return 'Auth Bearer: informe o ref do token';
    }
    if (authMode === 'apikey') {
      if (!authCreds.headerName?.trim() || !authCreds.valueRef?.trim()) {
        return 'API Key: informe o nome do header e o ref do valor';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) return addToast(err, 'amber');
    const authErr = validateAuth();
    if (authErr) return addToast(authErr, 'amber');

    // Headers extras: remover linhas em branco e detectar duplicatas
    const declaredHeaderKeys = extraHeaders.map((h) => h.key.trim()).filter(Boolean);
    if (new Set(declaredHeaderKeys).size !== declaredHeaderKeys.length) {
      return addToast('Headers extras com nome duplicado. Renomeie pra evitar sobrescrita.', 'amber');
    }
    const headersRecord = entriesToHeaders(extraHeaders);

    setLoading(true);
    try {
      const trimmedAuth: ToolAuthCredentials = {
        usernameRef: authCreds.usernameRef?.trim() || undefined,
        passwordRef: authCreds.passwordRef?.trim() || undefined,
        tokenRef: authCreds.tokenRef?.trim() || undefined,
        headerName: authCreds.headerName?.trim() || undefined,
        valueRef: authCreds.valueRef?.trim() || undefined,
      };

      const payload = {
        name: name.trim(),
        description: description.trim(),
        endpoint: endpoint.trim(),
        method,
        scope: scope.trim() || 'global',
        active,
        parameters: parameters.length ? parameters : undefined,
        authType: authMode === 'none' ? undefined : authMode,
        authCredentials: authMode === 'none' ? undefined : trimmedAuth,
        extraHeaders: Object.keys(headersRecord).length ? headersRecord : undefined,
      };

      if (isEdit && tool) {
        await updateTool(tool.id, payload);
      } else {
        await createTool(payload);
      }
      onClose();
    } catch {
      addToast('Erro ao salvar ferramenta', 'red');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!tool) return;
    if (!confirm(`Remover a ferramenta "${tool.name}"? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    try {
      await deleteTool(tool.id);
      onClose();
    } catch {
      addToast('Erro ao remover', 'red');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Editar Ferramenta' : 'Nova Ferramenta'}
      subtitle="Defina o endpoint que o colaborador digital poderá invocar"
      onClose={onClose}
      maxWidth="720px"
      footer={
        <>
          {isEdit && (
            <button className="btn btn-danger mr-auto" onClick={handleDelete} disabled={loading}>
              <Trash2 size={13} /> Remover
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-accent" onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Ferramenta'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Nome + Ativo */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Nome (identificador)
            </label>
            <input
              className="input font-mono"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              placeholder="ex: consultar_cliente"
              disabled={isEdit}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <span className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
              Ativo
            </span>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`w-[34px] h-[20px] rounded-full relative transition-all ${
                active ? 'bg-brand/30 border border-brand' : 'bg-surface-0 border border-default'
              }`}
            >
              <span
                className={`absolute top-[2px] w-[12px] h-[12px] rounded-full transition-all ${
                  active
                    ? 'left-[calc(100%-15px)] bg-brand-bright shadow-[0_0_4px_rgba(138,186,122,0.5)]'
                    : 'left-[3px] bg-creme-faint'
                }`}
              />
            </button>
          </div>
        </div>

        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
            Descrição
          </label>
          <textarea
            className="textarea text-[14px] min-h-[64px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que esta ferramenta faz? O agente usa essa descrição para decidir quando invocá-la."
          />
        </div>

        {/* Endpoint + método */}
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Método
            </label>
            <select
              className="input font-mono"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
              Endpoint
            </label>
            <input
              className="input font-mono"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="/api/clients/lookup"
            />
          </div>
        </div>

        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
            Escopo
          </label>
          <input
            className="input font-mono"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            list="scope-suggestions"
            placeholder="global ou nome do cliente"
          />
          <datalist id="scope-suggestions">
            {scopeSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="text-[12.5px] text-creme-faint mt-1">
            Use <span className="font-mono">global</span> para disponibilizar a todos, ou um cliente para restringir.
          </p>
        </div>

        {/* Parâmetros */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
              Parâmetros
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addParam}>
              <Plus size={12} /> Adicionar
            </button>
          </div>
          {parameters.length === 0 ? (
            <div className="text-[13px] text-creme-faint italic px-3 py-2 bg-surface-2 border border-default rounded-lg">
              Nenhum parâmetro definido.
            </div>
          ) : (
            <div className="space-y-2">
              {parameters.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_110px_90px_auto] gap-2 items-center bg-surface-2 border border-default rounded-lg p-2"
                >
                  <input
                    className="input font-mono text-[13px]"
                    value={p.name}
                    onChange={(e) => updateParam(i, { name: e.target.value })}
                    placeholder="nome_param"
                  />
                  <select
                    className="input font-mono text-[13px]"
                    value={p.type}
                    onChange={(e) => updateParam(i, { type: e.target.value as ParamType })}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-[13px] text-creme-mute">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={(e) => updateParam(i, { required: e.target.checked })}
                    />
                    obrig.
                  </label>
                  <button
                    type="button"
                    className="text-creme-faint hover:text-semantic-red transition-colors p-1"
                    onClick={() => removeParam(i)}
                  >
                    <Trash2 size={13} />
                  </button>
                  <input
                    className="input text-[13px] col-span-4"
                    value={p.description}
                    onChange={(e) => updateParam(i, { description: e.target.value })}
                    placeholder="Descrição do parâmetro"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Autenticação */}
        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">
            Autenticação
          </label>
          <select
            className="input font-mono"
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
          >
            <option value="none">Nenhuma</option>
            <option value="basic">Basic (usuário + senha)</option>
            <option value="bearer">Bearer token</option>
            <option value="apikey">API Key (header customizado)</option>
          </select>
          {authMode !== 'none' && (
            <p className="text-[12px] text-creme-faint mt-1">
              Os campos abaixo apontam pro <span className="font-mono">nome</span> da credencial
              cadastrada no workspace do cliente — o valor real fica no banco e nunca aparece aqui.
            </p>
          )}

          {authMode === 'basic' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                className="input font-mono text-[13px]"
                value={authCreds.usernameRef ?? ''}
                onChange={(e) => updateAuthCred({ usernameRef: e.target.value })}
                placeholder="ref do username (ex: ixc_token)"
              />
              <input
                className="input font-mono text-[13px]"
                value={authCreds.passwordRef ?? ''}
                onChange={(e) => updateAuthCred({ passwordRef: e.target.value })}
                placeholder="ref do password (ex: ixc_hash)"
              />
            </div>
          )}

          {authMode === 'bearer' && (
            <div className="mt-2">
              <input
                className="input font-mono text-[13px]"
                value={authCreds.tokenRef ?? ''}
                onChange={(e) => updateAuthCred({ tokenRef: e.target.value })}
                placeholder="ref do token (ex: hubspot_key)"
              />
            </div>
          )}

          {authMode === 'apikey' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                className="input font-mono text-[13px]"
                value={authCreds.headerName ?? ''}
                onChange={(e) => updateAuthCred({ headerName: e.target.value })}
                placeholder="nome do header (ex: X-API-Key)"
              />
              <input
                className="input font-mono text-[13px]"
                value={authCreds.valueRef ?? ''}
                onChange={(e) => updateAuthCred({ valueRef: e.target.value })}
                placeholder="ref do valor (ex: foo_key)"
              />
            </div>
          )}
        </div>

        {/* Headers extras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute">
              Headers extras
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addHeader}>
              <Plus size={12} /> Adicionar
            </button>
          </div>
          {extraHeaders.length === 0 ? (
            <div className="text-[13px] text-creme-faint italic px-3 py-2 bg-surface-2 border border-default rounded-lg">
              Nenhum header extra. Útil pra APIs que exigem headers fixos (ex:{' '}
              <span className="font-mono">ixcsoft: listar</span>).
            </div>
          ) : (
            <div className="space-y-2">
              {extraHeaders.map((h, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center bg-surface-2 border border-default rounded-lg p-2"
                >
                  <input
                    className="input font-mono text-[13px]"
                    value={h.key}
                    onChange={(e) => updateHeader(i, { key: e.target.value })}
                    placeholder="nome do header"
                  />
                  <input
                    className="input font-mono text-[13px]"
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    placeholder="valor"
                  />
                  <button
                    type="button"
                    className="text-creme-faint hover:text-semantic-red transition-colors p-1"
                    onClick={() => removeHeader(i)}
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
