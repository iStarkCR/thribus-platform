/**
 * Platform — onboarding, status, help/academy, mobile/push, profile.
 * Funcionalidades transversais agrupadas.
 */
import { supabase } from '@/lib/supabase';

export const platformConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

// ─── Onboarding ─────────────────────────────────────────────────────────────
export interface OnboardingProgress {
  stepsCompleted: string[]; currentStep: number;
  completedAt?: string; startedAt: string;
}

export async function getOnboardingProgress(workspaceId: string): Promise<OnboardingProgress | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    stepsCompleted: (r.steps_completed as string[]) ?? [],
    currentStep: r.current_step as number,
    completedAt: (r.completed_at as string) ?? undefined,
    startedAt: r.started_at as string,
  };
}

export async function completeOnboardingStep(workspaceId: string, step: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.rpc('complete_onboarding_step', {
    p_workspace_id: workspaceId, p_step: step,
  });
  if (error) throw error;
}

// ─── Status ─────────────────────────────────────────────────────────────────
export interface StatusComponent {
  id: string; name: string; description?: string;
  status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'maintenance';
  uptime30dPct: number; sortOrder: number;
}

export interface StatusIncident {
  id: string; title: string; description?: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string; resolvedAt?: string;
  updates: { timestamp: string; message: string }[];
}

export async function listStatusComponents(): Promise<StatusComponent[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('status_components')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string,
    description: (r.description as string) ?? undefined,
    status: r.status as StatusComponent['status'],
    uptime30dPct: Number(r.uptime_30d_pct),
    sortOrder: r.sort_order as number,
  }));
}

export async function listStatusIncidents(limit = 20): Promise<StatusIncident[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('status_incidents')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, title: r.title as string,
    description: (r.description as string) ?? undefined,
    severity: r.severity as StatusIncident['severity'],
    status: r.status as StatusIncident['status'],
    startedAt: r.started_at as string,
    resolvedAt: (r.resolved_at as string) ?? undefined,
    updates: (r.updates as { timestamp: string; message: string }[]) ?? [],
  }));
}

// ─── Help / Academy ─────────────────────────────────────────────────────────
export interface KbArticle {
  id: string; slug: string; title: string; category: string;
  readTimeMin: number; views: number; helpfulCount: number;
  publishedAt: string;
}

export interface Course {
  id: string; slug: string; title: string; description?: string;
  durationMin: number; level: string; certification: boolean;
  enrollments: number; completions: number;
}

export async function listKbArticles(): Promise<KbArticle[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('kb_articles')
    .select('id, slug, title, category, read_time_min, views, helpful_count, published_at')
    .eq('published', true)
    .order('views', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, slug: r.slug as string, title: r.title as string,
    category: r.category as string, readTimeMin: r.read_time_min as number,
    views: r.views as number, helpfulCount: r.helpful_count as number,
    publishedAt: r.published_at as string,
  }));
}

export async function listCourses(): Promise<Course[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('academy_courses')
    .select('id, slug, title, description, duration_min, level, certification, enrollments, completions')
    .eq('published', true)
    .order('enrollments', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, slug: r.slug as string, title: r.title as string,
    description: (r.description as string) ?? undefined,
    durationMin: r.duration_min as number, level: r.level as string,
    certification: r.certification as boolean,
    enrollments: r.enrollments as number,
    completions: r.completions as number,
  }));
}

// ─── Mobile / Push ──────────────────────────────────────────────────────────
export async function registerPushSubscription(params: {
  workspaceId: string; endpoint: string; p256dh: string; authKey: string;
  deviceLabel?: string; userAgent?: string;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('push_subscriptions').upsert({
    workspace_id: params.workspaceId,
    endpoint: params.endpoint, p256dh: params.p256dh, auth_key: params.authKey,
    device_label: params.deviceLabel, user_agent: params.userAgent,
  }, { onConflict: 'user_id,endpoint' });
  if (error) throw error;
}

export interface NotifPreferences {
  emailEnabled: boolean; pushEnabled: boolean; whatsappEnabled: boolean;
  quietHoursStart?: string; quietHoursEnd?: string;
  kindsMuted: string[];
}

export async function getNotifPreferences(workspaceId: string): Promise<NotifPreferences | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    emailEnabled: r.email_enabled as boolean,
    pushEnabled: r.push_enabled as boolean,
    whatsappEnabled: r.whatsapp_enabled as boolean,
    quietHoursStart: (r.quiet_hours_start as string) ?? undefined,
    quietHoursEnd: (r.quiet_hours_end as string) ?? undefined,
    kindsMuted: (r.kinds_muted as string[]) ?? [],
  };
}

export async function saveNotifPreferences(workspaceId: string, prefs: Partial<NotifPreferences>): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      workspace_id: workspaceId,
      email_enabled: prefs.emailEnabled,
      push_enabled: prefs.pushEnabled,
      whatsapp_enabled: prefs.whatsappEnabled,
      quiet_hours_start: prefs.quietHoursStart,
      quiet_hours_end: prefs.quietHoursEnd,
      kinds_muted: prefs.kindsMuted,
    }, { onConflict: 'user_id,workspace_id' });
  if (error) throw error;
}

// ─── Profile (Supabase Auth user_metadata) ──────────────────────────────────
export async function updateProfile(metadata: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.auth.updateUser({ data: metadata });
  if (error) throw error;
}
