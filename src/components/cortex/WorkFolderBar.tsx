/**
 * Seletor de pasta de trabalho da conversa — igual ao seletor de projeto do
 * Claude Code. A pasta escolhida vira o cwd do `claude` no bridge (lê CLAUDE.md/
 * skills/.claude daquela pasta). Lista curada de cortex_work_folders (= allowlist)
 * + "Abrir pasta…" pra adicionar um caminho avulso. null = default do colaborador.
 */
import { useEffect, useState } from 'react';
import { Folder, ChevronDown, Check, Plus } from 'lucide-react';
import { listWorkFolders, addWorkFolder, type WorkFolder } from '@/services/chatSessions';

const baseName = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;

export function WorkFolderBar({ workingDir, onChange }: { workingDir: string | null; onChange: (path: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<WorkFolder[]>([]);

  const load = () => { listWorkFolders().then(setFolders).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const current = workingDir ? (folders.find((f) => f.path === workingDir)?.label ?? baseName(workingDir)) : null;

  const addNew = async () => {
    const path = window.prompt('Caminho absoluto da pasta (no Mac do daemon):');
    if (!path || !path.trim()) return;
    const clean = path.trim().replace(/\/+$/, '');
    const label = (window.prompt('Nome curto pra exibir:', baseName(clean)) || baseName(clean)).trim();
    try {
      const existing = folders.find((f) => f.path === clean);
      const wf = existing ?? await addWorkFolder(label, clean);
      setFolders((prev) => (existing ? prev : [...prev, wf]));
      onChange(wf.path);
      setOpen(false);
    } catch { /* RLS/duplicado — silencioso */ }
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => { if (!open) load(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] hover:bg-surface-hover transition-colors"
        title="Pasta de trabalho desta conversa — onde o colaborador roda"
      >
        <Folder size={13} className={current ? 'text-brand-bright' : 'text-creme-faint'} />
        <span className={`font-semibold ${current ? 'text-creme-dim' : 'text-creme-faint'}`}>{current ?? 'Pasta'}</span>
        <ChevronDown size={12} className="text-creme-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-[61] w-72 rounded-xl border border-default bg-surface-1 shadow-2xl p-2">
            <div className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-creme-faint">Pasta de trabalho</div>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${!workingDir ? 'bg-brand/10' : 'hover:bg-surface-hover'}`}
              >
                <span className="flex-1 min-w-0 text-[12.5px] text-creme-mute italic">Padrão do colaborador</span>
                {!workingDir && <Check size={14} className="text-brand-bright shrink-0" />}
              </button>
              {folders.map((f) => {
                const active = workingDir === f.path;
                return (
                  <button
                    key={f.id}
                    onClick={() => { onChange(f.path); setOpen(false); }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${active ? 'bg-brand/10' : 'hover:bg-surface-hover'}`}
                  >
                    <Folder size={13} className="text-brand-bright/70 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-creme truncate">{f.label}</div>
                      <div className="font-mono text-[10px] text-creme-faint truncate">{f.path}</div>
                    </div>
                    {active && <Check size={14} className="text-brand-bright shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 pt-1.5 border-t border-default">
              <button onClick={addNew} className="w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 text-creme-mute hover:bg-surface-hover hover:text-creme transition-colors">
                <Plus size={13} className="text-brand-bright" />
                <span className="text-[12.5px] font-medium">Abrir pasta…</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
