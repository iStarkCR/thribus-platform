import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import type { Tool, ToolParameter } from '@/types';

interface Props {
  tool?: Tool;
  onClose: () => void;
}

type HttpMethod = Tool['method'];
type ParamType = ToolParameter['type'];

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
  const [loading, setLoading] = useState(false);

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

  const handleSave = async () => {
    const err = validate();
    if (err) return addToast(err, 'amber');

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        endpoint: endpoint.trim(),
        method,
        scope: scope.trim() || 'global',
        active,
        parameters: parameters.length ? parameters : undefined,
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
      </div>
    </Modal>
  );
}
