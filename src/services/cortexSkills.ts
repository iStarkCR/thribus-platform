/**
 * Cortex Skills — skills cadastradas pelo painel que alimentam o Claude.
 * managed=false → importada de ~/.claude/skills (espelho, read-only).
 * managed=true  → criada aqui; a ponte escreve em ~/.claude/skills quando enabled.
 */
import { supabase } from '@/lib/supabase';

export interface CortexSkill {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  body: string;
  managed: boolean;
  enabled: boolean;
  updatedAt: string;
}

export const cortexSkillsConfigured = Boolean(supabase);

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

interface Row {
  id: string; slug: string; name: string; description: string | null;
  body: string; managed: boolean; enabled: boolean; updated_at: string;
}
const toSkill = (r: Row): CortexSkill => ({
  id: r.id, slug: r.slug, name: r.name, description: r.description,
  body: r.body, managed: r.managed, enabled: r.enabled, updatedAt: r.updated_at,
});

export async function listCortexSkills(): Promise<CortexSkill[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cortex_skills')
    .select('id,slug,name,description,body,managed,enabled,updated_at')
    .order('managed', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toSkill);
}

export async function createCortexSkill(userId: string, input: {
  name: string; slug: string; description?: string; body: string; enabled?: boolean;
}): Promise<CortexSkill> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('cortex_skills')
    .insert({
      user_id: userId, slug: input.slug, name: input.name,
      description: input.description ?? null, body: input.body,
      managed: true, enabled: input.enabled ?? false,
    })
    .select('id,slug,name,description,body,managed,enabled,updated_at')
    .single();
  if (error) throw error;
  return toSkill(data as Row);
}

export async function updateCortexSkill(id: string, patch: {
  name?: string; description?: string | null; body?: string;
}): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.body !== undefined) row.body = patch.body;
  const { error } = await supabase.from('cortex_skills').update(row).eq('id', id);
  if (error) throw error;
}

export async function setCortexSkillEnabled(id: string, enabled: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('cortex_skills').update({ enabled }).eq('id', id);
  if (error) throw error;
}

export async function deleteCortexSkill(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('cortex_skills').delete().eq('id', id);
  if (error) throw error;
}

let seq = 0;
export function subscribeCortexSkills(onChange: () => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`cortex-skills:${++seq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cortex_skills' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
