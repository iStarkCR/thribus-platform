import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Search, Loader2, Check, Building2, Info } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';
import { useAppStore } from '@/hooks/useAppStore';
import { listWorkspaceModules, setWorkspaceModule, accessConfigured } from '@/services/access';

/**
 * Acessos (admin) — por CONTA (workspace). O super-admin liga/desliga quais
 * módulos cada conta enxerga. Conta sem nada marcado = vê tudo (não configurada).
 */
export function AccessPage() {
  const workspaces = useAppStore((s) => s.workspaces);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && workspaces.length) setSelectedId(workspaces[0].id);
  }, [workspaces, selectedId]);

  useEffect(() => {
    if (!selectedId || !accessConfigured) return;
    setLoading(true);
    listWorkspaceModules(selectedId)
      .then((m) => setModules(new Set(m)))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const filtered = useMemo(
    () => workspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase())),
    [workspaces, search],
  );
  const selected = workspaces.find((w) => w.id === selectedId) ?? null;
  const isEmpty = modules.size === 0;

  async function toggle(path: string, enabled: boolean) {
    if (!selected) return;
    setSaving(path);
    setModules((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(path);
      else next.delete(path);
      return next;
    });
    try {
      await setWorkspaceModule(selected.id, path, enabled);
    } catch (e) {
      setModules((prev) => {
        const next = new Set(prev);
        if (enabled) next.delete(path);
        else next.add(path);
        return next;
      });
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (!accessConfigured) {
    return (
      <div className="p-6 text-creme-mute text-[13px]">
        Supabase não configurado — defina <code className="font-mono text-creme">.env.local</code> pra gerenciar acessos.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-[19px] font-bold text-creme flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand" /> Acessos
        </h1>
        <p className="text-[12.5px] text-creme-mute mt-0.5">
          Por conta: libere quais módulos cada cliente enxerga ao entrar na conta dele.
        </p>
      </header>

      {error && <div className="mb-4 px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}

      <div className="grid grid-cols-[260px_1fr] gap-4">
        {/* Contas */}
        <div className="bg-surface-1 border border-default rounded-xl overflow-hidden self-start">
          <div className="p-2.5 border-b border-default">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conta…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {filtered.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedId(w.id)}
                className={`w-full flex items-center gap-2 text-left px-3 py-2.5 border-b border-default/50 transition-colors ${
                  selectedId === w.id ? 'bg-brand/10' : 'hover:bg-surface-hover'
                }`}
              >
                <Building2 size={13} className="text-creme-faint shrink-0" />
                <span className="text-[12.5px] text-creme truncate">{w.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-[12px] text-creme-faint">Nenhuma conta.</div>}
          </div>
        </div>

        {/* Módulos da conta */}
        <div className="bg-surface-1 border border-default rounded-xl p-4">
          {!selected ? (
            <div className="text-[12.5px] text-creme-faint">Selecione uma conta.</div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-creme-faint text-[12.5px]">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="text-[12.5px] text-creme-mute mb-3">
                Módulos liberados pra <b className="text-creme">{selected.name}</b>:
              </div>
              {isEmpty && (
                <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-semantic-blue/10 text-semantic-blue text-[11.5px]">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <span>Conta não configurada — enxerga <b>tudo</b>. Marque módulos abaixo pra restringir só aos marcados.</span>
                </div>
              )}
              <div className="space-y-4">
                {NAV_ITEMS.map((group) => (
                  <div key={group.group}>
                    <div className="text-[10.5px] font-bold uppercase tracking-widest text-creme-faint mb-1.5">{group.group}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map((item) => {
                        const on = modules.has(item.path);
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.path}
                            onClick={() => toggle(item.path, !on)}
                            disabled={saving === item.path}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[12.5px] transition-colors ${
                              on ? 'bg-brand/10 border-brand/40 text-creme' : 'bg-surface-2 border-default text-creme-mute hover:bg-surface-hover'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-brand text-white' : 'border border-creme-faint'}`}>
                              {saving === item.path ? <Loader2 size={10} className="animate-spin" /> : on ? <Check size={11} /> : null}
                            </span>
                            <Icon size={13} className="shrink-0 opacity-60" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
