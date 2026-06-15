import { useState } from 'react';
import { X, UserPlus, Loader2, Check } from 'lucide-react';
import type { Workspace } from '@/types';
import { provisionUser, type WorkspaceRole } from '@/services/access';

/**
 * Cria um usuário de login pra um workspace, com cargo. Usa a Edge Function
 * provision-user (service role). Só super-admin consegue (gate no backend).
 */
export function AddUserModal({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function genPassword() {
    const base = Math.random().toString(36).slice(2, 10);
    setPassword(`${base.charAt(0).toUpperCase()}${base.slice(1)}!${Math.floor(Math.random() * 90 + 10)}`);
  }

  async function submit() {
    if (!email || !password) {
      setError('Email e senha são obrigatórios');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await provisionUser({ email, password, workspaceId: workspace.id, role, name: name || undefined });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-surface-1 border border-default rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <div className="flex items-center gap-2 text-[14px] font-bold text-creme">
            <UserPlus size={15} className="text-brand" /> Novo usuário — {workspace.name}
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="p-5">
            <div className="flex items-center gap-2 text-[13px] text-semantic-green mb-3">
              <Check size={16} /> Usuário criado e vinculado a {workspace.name} ({role}).
            </div>
            <div className="bg-surface-2 border border-default rounded-lg p-3 text-[12.5px] space-y-1">
              <div className="text-creme-mute">Passe as credenciais ao cliente:</div>
              <div className="font-mono text-creme">{email}</div>
              <div className="font-mono text-creme">{password}</div>
            </div>
            <button className="btn btn-accent w-full mt-4" onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {error && <div className="px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" />
            </Field>
            <Field label="Nome (opcional)">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do contato" />
            </Field>
            <Field label="Senha">
              <div className="flex gap-2">
                <input className="input flex-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha temporária" />
                <button className="btn btn-ghost text-[12px]" onClick={genPassword} type="button">Gerar</button>
              </div>
            </Field>
            <Field label="Cargo no workspace">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                <option value="member">Membro (vê só o liberado)</option>
                <option value="admin">Admin da conta</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
            <button className="btn btn-accent w-full mt-1" onClick={submit} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Criar usuário
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">{label}</label>
      {children}
    </div>
  );
}
