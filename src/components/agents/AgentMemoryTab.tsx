/**
 * Aba "Memória" do colaborador — ver/editar/apagar os fatos de longo prazo.
 * Lê/escreve o espelho cortex_memory; a ponte sincroniza com a VPS. Linhas com
 * pendingOp ficam marcadas "sincronizando…" até a ponte processar.
 */
import { useEffect, useState } from 'react';
import { Brain, Plus, Trash2, Loader2, RefreshCw, Power } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listMemory, addMemory, updateMemory, removeMemory, type MemoryFact,
} from '@/services/collaboratorMemory';

export function AgentMemoryTab({ agentId }: { agentId: string }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const { addToast } = useAppStore();

  const load = async () => {
    try { setFacts(await listMemory(agentId)); }
    catch (e) { addToast('Falha ao carregar memória: ' + (e as Error).message, 'red'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [agentId]);

  const add = async () => {
    const fact = draft.trim();
    if (!fact) return;
    setAdding(true);
    try { await addMemory(agentId, { fact }); setDraft(''); await load(); }
    catch (e) { addToast('Falha ao salvar: ' + (e as Error).message, 'red'); }
    finally { setAdding(false); }
  };

  const toggle = async (f: MemoryFact) => {
    try { await updateMemory(f.id, { active: !f.active }); await load(); }
    catch (e) { addToast('Falha: ' + (e as Error).message, 'red'); }
  };

  const remove = async (f: MemoryFact) => {
    const ok = await useAppStore.getState().askConfirm({
      title: 'Apagar fato', message: `"${f.fact}"`, confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try { await removeMemory(f.id, f.remoteId); await load(); }
    catch (e) { addToast('Falha ao apagar: ' + (e as Error).message, 'red'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-[12px] text-creme-faint bg-surface-1 border border-default rounded-lg px-3 py-2">
        <Brain size={14} className="text-brand-bright shrink-0 mt-0.5" />
        <span>
          O que este colaborador <b className="text-creme-dim">lembra entre conversas</b>. Entra no contexto dele
          de forma cacheada (custo ~zero por mensagem). Ele também aprende sozinho ao compactar conversas.
        </span>
      </div>

      {/* adicionar */}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="Novo fato pra ele lembrar (ex: prefiro respostas curtas e diretas)"
          className="flex-1 bg-surface-1 border border-default rounded-lg px-3 py-2 text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
        />
        <button
          onClick={add}
          disabled={adding || !draft.trim()}
          className="px-3 rounded-lg bg-brand text-white flex items-center gap-1.5 text-[12.5px] font-semibold disabled:opacity-40 hover:bg-brand-bright transition-colors"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
        </button>
      </div>

      {/* lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-creme-faint text-[13px] py-6 justify-center">
          <Loader2 size={15} className="animate-spin" /> carregando memória…
        </div>
      ) : facts.length === 0 ? (
        <div className="text-center text-creme-faint text-[13px] py-8">
          Nenhum fato ainda. Adicione acima, ou deixe ele aprender ao usar.
          <div className="text-[11px] mt-1 opacity-70">Se a ponte estiver desligada, o espelho fica vazio até ela sincronizar.</div>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
          {facts.map((f) => (
            <div
              key={f.id}
              className={`group flex items-start gap-2 px-3 py-2 rounded-lg border transition-colors ${
                f.active ? 'bg-surface-1 border-default' : 'bg-surface-1/40 border-default/60 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] leading-snug ${f.active ? 'text-creme-dim' : 'text-creme-faint line-through'}`}>{f.fact}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-creme-faint">
                  {f.category && <span className="px-1.5 py-0.5 rounded bg-surface-3">{f.category}</span>}
                  {f.entity && <span>· {f.entity}</span>}
                  {f.pendingOp && <span className="flex items-center gap-1 text-gold-bright"><RefreshCw size={9} className="animate-spin" /> sincronizando…</span>}
                </div>
              </div>
              <button onClick={() => toggle(f)} title={f.active ? 'Desativar' : 'Ativar'} className="shrink-0 p-1 text-creme-faint hover:text-creme transition-colors"><Power size={13} /></button>
              <button onClick={() => remove(f)} title="Apagar" className="shrink-0 p-1 text-creme-faint hover:text-semantic-red transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
