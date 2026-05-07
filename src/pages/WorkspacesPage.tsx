import { useState } from 'react';
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { WorkspaceModal } from '@/components/workspaces/WorkspaceModal';
import type { Workspace } from '@/types';

export function WorkspacesPage() {
  const workspaces = useAppStore((s) => s.workspaces);
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);

  const handleDelete = async (ws: Workspace) => {
    if (!confirm(`Remover workspace "${ws.name}"? Agents vinculados ficam sem workspace mas não são apagados.`)) return;
    await deleteWorkspace(ws.id);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Building2 size={16} className="text-creme-mute" /> Workspaces (clientes)
          <span className="ml-2 chip chip-muted">{workspaces.length}</span>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNew(true)}>
          <Plus size={13} /> Novo Workspace
        </button>
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-surface-2 border border-default rounded-[10px] px-12 py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-4">
            <Building2 size={22} className="text-creme-faint" />
          </div>
          <p className="text-sm text-creme font-semibold mb-1">Nenhum workspace cadastrado</p>
          <p className="text-[13.5px] text-creme-mute mb-5">
            Cada cliente tem seu próprio workspace com credenciais isoladas (LLM, CRM, tokens). Permite servir múltiplos clientes do mesmo worker.
          </p>
          <button className="btn btn-accent mx-auto" onClick={() => setShowNew(true)}>
            <Plus size={13} /> Criar primeiro workspace
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-brand/[0.08] text-brand flex items-center justify-center">
                  <Building2 size={16} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(w)}
                    className="text-creme-faint hover:text-creme p-1"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(w)}
                    className="text-semantic-red/70 hover:text-semantic-red p-1"
                    title="Remover"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="text-sm font-bold text-creme mb-1.5">{w.name}</div>
              <div className="space-y-1 text-[12.5px]">
                <div className="flex items-center justify-between text-creme-mute">
                  <span>LLM:</span>
                  <span className="font-mono text-brand">{w.llmProvider}{w.llmApiKey ? ' ✓' : ' (env)'}</span>
                </div>
                {w.crmProvider && (
                  <div className="flex items-center justify-between text-creme-mute">
                    <span>CRM:</span>
                    <span className="font-mono text-brand">{w.crmProvider}{w.crmApiToken ? ' ✓' : ' (env)'}</span>
                  </div>
                )}
                {w.talkiRequiredLabel && (
                  <div className="flex items-center justify-between text-creme-mute">
                    <span>Label:</span>
                    <span className="font-mono text-brand">{w.talkiRequiredLabel}</span>
                  </div>
                )}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-default text-[12px] font-mono text-creme-faint truncate" title={w.id}>
                {w.id}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <WorkspaceModal onClose={() => setShowNew(false)} />}
      {editing && <WorkspaceModal workspace={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
