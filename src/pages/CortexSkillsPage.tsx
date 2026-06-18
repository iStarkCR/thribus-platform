/**
 * Skills do Claude — cadastra/edita skills pelo painel. As suas skills reais
 * (~/.claude/skills) aparecem como espelho (read-only); as criadas aqui, ao
 * ligar "alimentar o Claude", a ponte escreve em ~/.claude/skills e o Bukowiski
 * passa a usar. (Só toca no que ela mesma cria — as reais ficam intactas.)
 */
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Plus, Loader2, Trash2, Power, Pencil, Eye, X, Check, Wand2 } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listCortexSkills, createCortexSkill, updateCortexSkill, setCortexSkillEnabled,
  deleteCortexSkill, subscribeCortexSkills, slugify, cortexSkillsConfigured, type CortexSkill,
} from '@/services/cortexSkills';
import { CodeViewerModal } from '@/components/shared/CodeViewer';

export function CortexSkillsPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const addToast = useAppStore((s) => s.addToast);

  const [skills, setSkills] = useState<CortexSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CortexSkill | 'new' | null>(null);
  const [viewing, setViewing] = useState<CortexSkill | null>(null);

  const refetch = useCallback(() => { listCortexSkills().then(setSkills).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    listCortexSkills().then(setSkills).catch(() => {}).finally(() => setLoading(false));
    return subscribeCortexSkills(refetch);
  }, [refetch]);

  const panel = skills.filter((s) => s.managed);
  const imported = skills.filter((s) => !s.managed);

  async function toggle(s: CortexSkill) {
    setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    try { await setCortexSkillEnabled(s.id, !s.enabled); addToast(!s.enabled ? 'Ligada — o Bukowiski vai usar' : 'Desligada', !s.enabled ? 'green' : 'amber'); } catch { refetch(); }
  }
  async function remove(s: CortexSkill) {
    setSkills((prev) => prev.filter((x) => x.id !== s.id));
    try { await deleteCortexSkill(s.id); } catch { refetch(); }
  }

  if (!cortexSkillsConfigured) return <div className="p-6 text-creme-mute text-[13px]">Supabase não configurado.</div>;

  return (
    <div className="p-6 max-w-4xl">
      <header className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-bold text-creme flex items-center gap-2"><Sparkles size={18} className="text-brand" /> Skills do Claude</h1>
          <p className="text-[12.5px] text-creme-mute mt-0.5">Crie skills aqui e ligue <b className="text-creme">alimentar o Claude</b> — a ponte instala em <code className="font-mono">~/.claude/skills</code> e o Bukowiski usa.</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-bright transition-colors shrink-0"><Plus size={16} /> Nova skill</button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-creme-faint text-[13px]"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="text-[11px] font-bold uppercase tracking-wider text-creme-faint mb-2">Suas skills (painel)</div>
            {panel.length === 0 ? (
              <div className="rounded-xl border border-dashed border-default p-6 text-center text-creme-faint text-[13px]">Nenhuma ainda. Crie uma e ligue "alimentar o Claude".</div>
            ) : (
              <div className="space-y-2">
                {panel.map((s) => (
                  <div key={s.id} className={`flex items-center gap-3 rounded-xl border border-default bg-surface-1 p-3.5 ${!s.enabled ? 'opacity-70' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-creme flex items-center gap-2">{s.name}<span className="font-mono text-[10.5px] text-creme-faint">{s.slug}</span>{s.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-bright">no Claude</span>}</div>
                      {s.description && <div className="text-[12px] text-creme-mute mt-0.5 line-clamp-1">{s.description}</div>}
                    </div>
                    <button onClick={() => toggle(s)} title={s.enabled ? 'Desligar do Claude' : 'Alimentar o Claude'} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${s.enabled ? 'text-brand-bright hover:bg-brand/10' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}><Power size={15} /></button>
                    <button onClick={() => setEditing(s)} title="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-creme-faint hover:text-creme hover:bg-surface-hover"><Pencil size={14} /></button>
                    <button onClick={() => remove(s)} title="Apagar" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-creme-faint hover:text-semantic-red hover:bg-semantic-red/10"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="text-[11px] font-bold uppercase tracking-wider text-creme-faint mb-2">Skills do Claude já instaladas ({imported.length}) — espelho</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {imported.map((s) => (
                <button key={s.id} onClick={() => setViewing(s)} className="text-left rounded-lg border border-default bg-surface-1/60 p-3 hover:border-hover transition-colors">
                  <div className="text-[13px] font-semibold text-creme flex items-center gap-1.5"><Wand2 size={12} className="text-creme-faint" /> {s.slug}</div>
                  {s.description && <div className="text-[11.5px] text-creme-faint mt-1 line-clamp-2">{s.description}</div>}
                  <div className="text-[10.5px] text-brand-bright/70 mt-1.5 flex items-center gap-1"><Eye size={10} /> ver</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {editing && userId && (
        <SkillEditor userId={userId} skill={editing === 'new' ? null : editing} existingSlugs={skills.map((s) => s.slug)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />
      )}
      {viewing && <CodeViewerModal filename={`${viewing.slug}/SKILL.md`} content={`# ${viewing.name}\n\n${viewing.description || ''}\n\n${viewing.body}`} language="md" onClose={() => setViewing(null)} />}
    </div>
  );
}

function SkillEditor({ userId, skill, existingSlugs, onClose, onSaved }: {
  userId: string; skill: CortexSkill | null; existingSlugs: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(skill?.name ?? '');
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(skill));
  const [description, setDescription] = useState(skill?.description ?? '');
  const [body, setBody] = useState(skill?.body ?? '');
  const [enabled, setEnabled] = useState(skill?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(skill);

  async function submit() {
    if (!name.trim()) { setError('Dê um nome'); return; }
    const finalSlug = (slug || slugify(name)).trim();
    if (!finalSlug) { setError('Slug inválido'); return; }
    if (!isEdit && existingSlugs.includes(finalSlug)) { setError(`Já existe uma skill com o slug "${finalSlug}"`); return; }
    if (!description.trim()) { setError('A descrição é o que faz o Claude saber QUANDO usar — preencha'); return; }
    setSaving(true); setError(null);
    try {
      if (isEdit && skill) {
        await updateCortexSkill(skill.id, { name: name.trim(), description: description.trim(), body });
        if (enabled !== skill.enabled) await setCortexSkillEnabled(skill.id, enabled);
      } else {
        await createCortexSkill(userId, { name: name.trim(), slug: finalSlug, description: description.trim(), body, enabled });
      }
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default shrink-0">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2"><Sparkles size={16} className="text-brand" /> {isEdit ? 'Editar skill' : 'Nova skill'}</div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3.5 overflow-y-auto">
          {error && <div className="px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-[12px]">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome">
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="Ex: Padrão de proposta" autoFocus />
            </Field>
            <Field label="Slug (id)">
              <input className="input font-mono text-[13px]" value={slug} disabled={isEdit} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} placeholder="padrao-de-proposta" />
            </Field>
          </div>
          <Field label="Descrição — QUANDO o Claude deve usar (gatilho)">
            <textarea className="input min-h-[60px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use quando o usuário pedir uma proposta comercial B2B…" />
          </Field>
          <Field label="Conteúdo da skill (SKILL.md) — instruções, passos, exemplos">
            <textarea className="input min-h-[180px] resize-y font-mono text-[12.5px] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} placeholder={'# Como fazer X\n\n1. Passo um\n2. Passo dois\n\nRegras: …'} />
          </Field>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <button type="button" onClick={() => setEnabled((v) => !v)} className={`w-9 h-5 rounded-full relative transition-colors ${enabled ? 'bg-brand' : 'bg-surface-3'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <span className="text-[13px] text-creme">Alimentar o Claude <span className="text-creme-faint">(instala em ~/.claude/skills · até ~15s)</span></span>
          </label>
        </div>
        <div className="px-5 py-3.5 border-t border-default flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar</button>
        </div>
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
