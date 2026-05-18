/**
 * useSession — hook de autenticação Supabase Auth.
 *
 * Provê sessão atual, user, métodos signIn/signOut/signUp.
 * Quando Supabase não configurado, retorna estado mock guest-friendly.
 */

import { useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface SessionState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
}

export function useSession(): SessionState & {
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<{ error: Error | null }>;
  signInWithOAuth: (provider: 'google' | 'apple' | 'github') => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Record<string, unknown>) => Promise<{ error: Error | null }>;
} {
  const [state, setState] = useState<SessionState>({
    session: null,
    user: null,
    loading: true,
    configured: Boolean(supabase),
  });

  useEffect(() => {
    if (!supabase) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    // Sessão inicial
    supabase.auth.getSession().then(({ data }) => {
      setState((s) => ({ ...s, session: data.session, user: data.session?.user ?? null, loading: false }));
    });

    // Subscribe a mudanças
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, user: session?.user ?? null, loading: false }));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase não configurado') };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string, metadata: Record<string, unknown> = {}) => {
    if (!supabase) return { error: new Error('Supabase não configurado') };
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return { error };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple' | 'github') => {
    if (!supabase) return { error: new Error('Supabase não configurado') };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname + '#/' },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(async (data: Record<string, unknown>) => {
    if (!supabase) return { error: new Error('Supabase não configurado') };
    const { error } = await supabase.auth.updateUser({ data });
    return { error };
  }, []);

  return { ...state, signInWithPassword, signUpWithPassword, signInWithOAuth, signOut, updateProfile };
}
