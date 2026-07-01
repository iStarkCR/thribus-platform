/**
 * Cortex Brain → Skills.
 *
 * Cadastro de skills do time direto pelo painel. Você escreve nome + descrição
 * (o gatilho) + o markdown; a ponte materializa em ~/.claude/skills/<slug>/SKILL.md
 * e o Bukowiski/colaboradores passam a usar — sem mexer em arquivo. "Espelho do Claude."
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Plus, Pencil, Trash2, Power, Check, Loader2, X, Hash,
  HardDriveDownload, AlertCircle, CheckCircle2, FolderOpen,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore } from '@/hooks/useAppStore';
import {
  listSkills, createSkill, updateSkill, deleteSkill, toggleSkill, subscribeSkills,
  slugify, type CortexSkill,
} from '@/services/cortexSkills';

export function CortexBrainSkills() {
  const addToast = useAppStore((s) => s.addToast);
  const askConfirm = useAppStore((s) => s.askConfirm);

  const [skills, setSkills] = useState<CortexSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; skill?: CortexSkill } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => listSkills().then(setSkills).catch(() => {});

  useEffect(() => {
    let on = true;
    listSkills()
      .then((s) => { if (on) setSkills(s); })
      .catch(() => { if (on) addToast('Falha ao carregar skills', 'red'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [addToast]);

  // A ponte grava installed_at quando materializa → o painel atualiza sozinho.
  useEffect(() => subscribeSkills(reload), []);

  const onToggle = async (s: CortexSkill) => {
    setBusyId(s.id);
    try {
      const next = await toggleSkill(s.id, !s.enabled);
      setSkills((curr) => curr.map((x) => (x.id === s.id ? next : x)));
      addToast(next.enabled ? 'Skill ativada — a ponte vai instalar' : 'Skill desativada — a ponte vai remover', next.enabled ? 'green' : 'amber');
    } catch {
      addToast('Falha ao alternar a skill', 'red');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (s: CortexSkill) => {
    const ok = await askConfirm({
      title: 'Excluir skill',
      message: `Excluir "${s.name}"? A ponte vai remover ~/.claude/skills/${s.slug}/ do disco.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await deleteSkill(s.id);
      setSkills((curr) => curr.filter((x) => x.id !== s.id));
      addToast('Skill excluída', 'amber');
    } catch {
      addToast('Falha ao excluir', 'red');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-default bg-surface-1 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-bright" />
          <h2 className="text-[15px] font-bold text-creme">Skills</h2>
          <span className="text-[12px] text-creme-faint">— você escreve aqui, a ponte instala em <span className="font-mono">~/.claude/skills</span></span>
        </div>
        <button
          onClick={() => setEditor({ mode: 'create' })}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-dim border border-brand px-3 py-1.5 text-[12.5px] font-semibold text-creme hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all"
        >
          <Plus size={14} /> Nova skill
        </button>
      </div>

      {loading ? (
        <p className="text-creme-faint text-[12.5px] font-mono">Carregando skills…</p>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-default bg-surface-2/50 p-6 text-center">
          <Sparkles size={20} className="mx-auto text-creme-faint" />
          <p className="mt-2 text-[13px] text-creme-mute font-semibold">Nenhuma skill cadastrada</p>
          <p className="mt-1 text-[12px] text-creme-faint max-w-md mx-auto leading-snug">
            Crie uma skill com nome, descrição (o gatilho) e o markdown. A ponte instala em{' '}
            <span className="font-mono">~/.claude/skills/&lt;slug&gt;/SKILL.md</span> e o time já passa a usar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((s) => (
            <SkillRow
              key={s.id}
              skill={s}
              busy={busyId === s.id}
              onEdit={() => setEditor({ mode: 'edit', skill: s })}
              onToggle={() => onToggle(s)}
              onDelete={() => onDelete(s)}
            />
          ))}
        </div>
      )}

      {editor && (
        <SkillEditorModal
          mode={editor.mode}
          skill={editor.skill}
          existing={skills}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setSkills((curr) => {
              const i = curr.findIndex((x) => x.id === saved.id);
              return i === -1 ? [...curr, saved] : curr.map((x) => (x.id === saved.id ? saved : x));
            });
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}

// ─── Linha da lista ─────────────────────────────────────────────────────────
function SkillRow({
  skill, busy, onEdit, onToggle, onDelete,
}: {
  skill: CortexSkill;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-2 p-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-[13.5px] text-creme truncate">{skill.name}</span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10.5px] text-creme-mute">
            <Hash size={9} /> {skill.slug}
          </span>
          <InstallBadge skill={skill} />
        </div>
        {skill.description && (
          <p className="mt-1 text-[12px] text-creme-mute leading-snug line-clamp-2">{skill.description}</p>
        )}
        <p className="mt-1 font-mono text-[10.5px] text-creme-faint flex items-center gap-1">
          <FolderOpen size={10} /> ~/.claude/skills/{skill.slug}/SKILL.md
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <IconBtn title={skill.enabled ? 'Desativar' : 'Ativar'} onClick={onToggle} busy={busy}>
          <Power size={14} className={skill.enabled ? 'text-brand-bright' : 'text-creme-faint'} />
        </IconBtn>
        <IconBtn title="Editar" onClick={onEdit} busy={busy}>
          <Pencil size={14} className="text-creme-mute" />
        </IconBtn>
        <IconBtn title="Excluir" onClick={onDelete} busy={busy}>
          <Trash2 size={14} className="text-red-300/80" />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, busy, children }: { title: string; onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={busy}
      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function InstallBadge({ skill }: { skill: CortexSkill }) {
  if (!skill.enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-surface-3 text-creme-faint">
        desativada
      </span>
    );
  }
  if (skill.installedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-brand/15 text-brand-bright">
        <Check size={10} /> instalada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-400/10 text-amber-300">
      <HardDriveDownload size={10} className="animate-pulse" /> instalando…
    </span>
  );
}

// ─── Modal de criação/edição ──────────────────────────────────────────────────
function SkillEditorModal({
  mode, skill, existing, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  skill?: CortexSkill;
  existing: CortexSkill[];
  onClose: () => void;
  onSaved: (s: CortexSkill) => void;
}) {
  const [name, setName] = useState(skill?.name ?? '');
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [content, setContent] = useState(skill?.content ?? '');
  const [saving, setSaving] = useState(false);

  // Auto-gera slug enquanto digita o nome (até o user editar o slug à mão).
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const slugStatus = useMemo((): { state: 'idle' | 'ok' | 'taken' | 'invalid'; msg: string } => {
    if (!slug) return { state: 'idle', msg: '' };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { state: 'invalid', msg: 'letras minúsculas, números e hífen' };
    if (existing.some((x) => x.slug === slug && x.id !== skill?.id)) return { state: 'taken', msg: 'já existe' };
    return { state: 'ok', msg: 'disponível' };
  }, [slug, existing, skill?.id]);

  const valid = name.trim() && slug.trim() && description.trim() && content.trim()
    && slugStatus.state !== 'taken' && slugStatus.state !== 'invalid';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        content: content.trim(),
      };
      let saved: CortexSkill;
      if (mode === 'create') {
        saved = await createSkill(payload);
      } else {
        const patch: Partial<typeof payload> = {
          name: payload.name, description: payload.description, content: payload.content,
        };
        if (payload.slug !== skill!.slug) patch.slug = payload.slug; // renomear reinstala a pasta
        saved = await updateSkill(skill!.id, patch);
      }
      onSaved(saved);
    } catch (err) {
      useAppStore.getState().addToast(`Falha ao salvar: ${(err as Error).message ?? ''}`.slice(0, 120), 'red');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-[12px] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand-bright">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-creme">
                {mode === 'create' ? 'Nova skill' : `Editar: ${skill?.name}`}
              </h2>
              <p className="text-[12.5px] text-creme-faint">A ponte instala em ~/.claude/skills/&lt;slug&gt;/SKILL.md</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center text-creme-mute hover:text-creme transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Nome + Slug */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Relatório semanal de inadimplência"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5 flex items-center gap-1 justify-between">
                  <span className="flex items-center gap-1"><Hash size={11} /> Slug *</span>
                  <SlugBadge status={slugStatus} />
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                  required
                  placeholder="relatorio-inadimplencia"
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg bg-surface-2 border text-[14px] text-creme placeholder-creme-faint font-mono focus:outline-none',
                    slugStatus.state === 'taken' || slugStatus.state === 'invalid' ? 'border-semantic-red focus:border-semantic-red' : 'border-default focus:border-brand',
                  )}
                />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">Descrição (gatilho) *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={2}
                placeholder='Quando usar a skill. Ex: "Use quando o Charles pedir relatório de inadimplência — puxa o IXC, agrega por faixa de atraso e formata no padrão Thribus."'
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand resize-y"
              />
              <p className="mt-1 text-[11px] text-creme-faint">Vai pro <span className="font-mono">description</span> do frontmatter — é o que faz o Claude acionar a skill na hora certa.</p>
            </div>

            {/* Conteúdo */}
            <div>
              <label className="block text-[12px] uppercase tracking-wider font-bold text-creme-faint mb-1.5">Conteúdo (markdown) *</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={14}
                placeholder={'# Nome da Skill\n\nPasso a passo do que o time deve fazer.\n\n## Quando usar\n...\n\n## Procedimento\n1. ...\n2. ...'}
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-default text-[12.5px] text-creme placeholder-creme-faint font-mono focus:outline-none focus:border-brand leading-relaxed resize-y min-h-[260px]"
              />
              <p className="mt-1 text-[11px] text-creme-faint">
                A ponte gera o frontmatter (<span className="font-mono">name</span> + <span className="font-mono">description</span>) automaticamente — escreva só o corpo da skill.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-default flex items-center justify-end gap-2 shrink-0 bg-surface-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !valid}
              className="px-4 py-2 rounded-lg bg-brand-dim border border-brand text-creme text-[13px] font-semibold hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : mode === 'create' ? 'Criar skill' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SlugBadge({ status }: { status: { state: string; msg: string } }) {
  if (status.state === 'idle' || !status.msg) return null;
  const cfg = {
    ok: { color: 'text-semantic-green', Icon: CheckCircle2 },
    taken: { color: 'text-semantic-red', Icon: AlertCircle },
    invalid: { color: 'text-semantic-amber', Icon: AlertCircle },
  }[status.state] ?? { color: 'text-creme-faint', Icon: AlertCircle };
  const { color, Icon } = cfg;
  return (
    <span className={clsx('text-[10.5px] font-mono normal-case font-normal flex items-center gap-1', color)}>
      <Icon size={10} /> {status.msg}
    </span>
  );
}
