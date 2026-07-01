/**
 * Cortex Skills — skills do time cadastradas pelo painel (Cortex Brain).
 *
 * O painel faz o CRUD em `cortex_skills` (super-admin). A ponte (bridge, service
 * role) lê as habilitadas e materializa cada uma em ~/.claude/skills/<slug>/SKILL.md,
 * pro Bukowiski e colaboradores usarem sem mexer em arquivo. É o "espelho do Claude":
 * você escreve a skill aqui, a ponte instala no disco.
 */

import { supabase } from '@/lib/supabase';

export interface CortexSkill {
  id: string;
  /** nome da pasta ~/.claude/skills/<slug>/ e do frontmatter `name`. */
  slug: string;
  /** nome de exibição no painel. */
  name: string;
  /** frontmatter `description` — o gatilho que faz o Claude acionar a skill. */
  description: string;
  /** corpo markdown do SKILL.md (depois do frontmatter). */
  content: string;
  enabled: boolean;
  /** quando a ponte materializou no disco (null = ainda não instalada). */
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content: string | null;
  enabled: boolean;
  installed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Gera slug kebab-case a partir do nome (mesma regra do catálogo M3). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 50);
}

function fromRow(r: SkillRow): CortexSkill {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? '',
    content: r.content ?? '',
    enabled: r.enabled,
    installedAt: r.installed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS = 'id,slug,name,description,content,enabled,installed_at,created_at,updated_at';

export async function listSkills(): Promise<CortexSkill[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cortex_skills')
    .select(COLS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as SkillRow[]).map(fromRow);
}

export interface SkillInput {
  slug: string;
  name: string;
  description: string;
  content: string;
  enabled?: boolean;
}

export async function createSkill(input: SkillInput): Promise<CortexSkill> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('cortex_skills')
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description,
      content: input.content,
      enabled: input.enabled ?? true,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return fromRow(data as SkillRow);
}

export async function updateSkill(
  id: string,
  patch: Partial<SkillInput>,
): Promise<CortexSkill> {
  if (!supabase) throw new Error('Supabase não configurado');
  // mexer no conteúdo/nome/descrição reinstala: zera installed_at pra ponte
  // materializar de novo (e o painel mostrar "instalando…" até ela escrever).
  const { data, error } = await supabase
    .from('cortex_skills')
    .update({ ...patch, installed_at: null })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw error;
  return fromRow(data as SkillRow);
}

export async function toggleSkill(id: string, enabled: boolean): Promise<CortexSkill> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('cortex_skills')
    .update({ enabled })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw error;
  return fromRow(data as SkillRow);
}

export async function deleteSkill(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('cortex_skills').delete().eq('id', id);
  if (error) throw error;
}

let skillsSeq = 0;
export function subscribeSkills(onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`cortex-skills:${++skillsSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cortex_skills' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
