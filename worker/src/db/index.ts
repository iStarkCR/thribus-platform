/**
 * DB layer — Supabase Postgres
 *
 * Cada método tem dois caminhos:
 *  1. Supabase configurado → query real
 *  2. Sem Supabase → stub (para dev sem backend)
 *
 * Configure em worker/.env:
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   (bypass RLS)
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AgentRecord {
  id: string;
  name: string;
  client: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  channel?: string;
  workspaceId?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  llmProvider: 'openai' | 'anthropic';
  llmApiKey?: string;
  crmProvider?: 'talki' | 'texnet';
  crmBaseUrl?: string;
  crmAccountId?: string;
  crmApiToken?: string;
  texnetBotSenderId?: string;
  talkiRequiredLabel?: string;
}

interface ToolRecord {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  scope: string;
  active: boolean;
}

interface ConversationRecord {
  id: string;
  agentId: string;
  externalId: string;
  customerPhone: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notConfigured(method: string): never {
  throw new Error(
    `[db.${method}] Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em worker/.env`,
  );
}

function rowToWorkspace(data: Record<string, unknown>): WorkspaceRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    llmProvider: data.llm_provider as 'openai' | 'anthropic',
    llmApiKey: (data.llm_api_key as string | null) ?? undefined,
    crmProvider: (data.crm_provider as 'talki' | 'texnet' | null) ?? undefined,
    crmBaseUrl: (data.crm_base_url as string | null) ?? undefined,
    crmAccountId: (data.crm_account_id as string | null) ?? undefined,
    crmApiToken: (data.crm_api_token as string | null) ?? undefined,
    texnetBotSenderId: (data.texnet_bot_sender_id as string | null) ?? undefined,
    talkiRequiredLabel: (data.talki_required_label as string | null) ?? undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════

export const db = {
  isConfigured: isSupabaseConfigured,

  agents: {
    async findById(id: string): Promise<AgentRecord | null> {
      if (!supabase) {
        console.warn(`[db.agents.findById] stub id=${id}`);
        return null;
      }
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        client: data.client,
        model: data.model,
        systemPrompt: data.system_prompt,
        tools: data.tools ?? [],
        channel: data.channel ?? undefined,
        workspaceId: data.workspace_id ?? undefined,
      };
    },

    async findByChannel(channel: string): Promise<AgentRecord | null> {
      if (!supabase) {
        console.warn(`[db.agents.findByChannel] stub channel=${channel}`);
        return null;
      }
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id')
        .eq('channel', channel)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        client: data.client,
        model: data.model,
        systemPrompt: data.system_prompt,
        tools: data.tools ?? [],
        channel: data.channel ?? undefined,
        workspaceId: data.workspace_id ?? undefined,
      };
    },

    async listWithChannel(): Promise<AgentRecord[]> {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id')
        .not('channel', 'is', null);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        client: a.client,
        model: a.model,
        systemPrompt: a.system_prompt,
        tools: a.tools ?? [],
        channel: a.channel ?? undefined,
        workspaceId: a.workspace_id ?? undefined,
      }));
    },
  },

  workspaces: {
    async findById(id: string): Promise<WorkspaceRecord | null> {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return rowToWorkspace(data);
    },

    async listByCrmProvider(provider: 'talki' | 'texnet'): Promise<WorkspaceRecord[]> {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('crm_provider', provider);
      if (error) throw error;
      return (data ?? []).map(rowToWorkspace);
    },
  },

  tools: {
    async listByAgent(agentId: string): Promise<ToolRecord[]> {
      if (!supabase) {
        console.warn(`[db.tools.listByAgent] stub agentId=${agentId}`);
        return [];
      }
      // Busca o agent pra saber o client (escopo)
      const { data: agentRow } = await supabase
        .from('agents')
        .select('client, tools')
        .eq('id', agentId)
        .maybeSingle();
      if (!agentRow) return [];

      // Tools cujo nome está em agent.tools E (scope=global OU scope=client)
      const allowedNames: string[] = agentRow.tools ?? [];
      if (allowedNames.length === 0) return [];

      const { data, error } = await supabase
        .from('tools')
        .select('id, name, description, endpoint, method, scope, active')
        .in('name', allowedNames)
        .eq('active', true)
        .or(`scope.eq.global,scope.eq.${agentRow.client}`);
      if (error) throw error;
      return (data ?? []) as ToolRecord[];
    },

    async findByName(name: string, agentId: string): Promise<ToolRecord | null> {
      if (!supabase) {
        console.warn(`[db.tools.findByName] stub name=${name} agentId=${agentId}`);
        return null;
      }
      const { data: agentRow } = await supabase
        .from('agents')
        .select('client')
        .eq('id', agentId)
        .maybeSingle();
      const client = agentRow?.client ?? '';

      const { data, error } = await supabase
        .from('tools')
        .select('id, name, description, endpoint, method, scope, active')
        .eq('name', name)
        .eq('active', true)
        .or(`scope.eq.global,scope.eq.${client}`)
        .maybeSingle();
      if (error) throw error;
      return (data as ToolRecord) ?? null;
    },
  },

  conversations: {
    async findOrCreate(opts: {
      externalId: string;
      agentId: string;
      customerPhone: string;
      customerName?: string;
    }): Promise<ConversationRecord> {
      if (!supabase) notConfigured('conversations.findOrCreate');

      // Tenta buscar
      const { data: existing } = await supabase
        .from('conversations')
        .select('id, agent_id, external_id, customer_phone, status')
        .eq('external_id', opts.externalId)
        .maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          agentId: existing.agent_id,
          externalId: existing.external_id,
          customerPhone: existing.customer_phone,
          status: existing.status,
        };
      }

      // Cria
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          agent_id: opts.agentId,
          external_id: opts.externalId,
          customer_phone: opts.customerPhone,
          customer_name: opts.customerName ?? null,
          status: 'active',
        })
        .select()
        .single();
      if (error) throw error;
      return {
        id: data.id,
        agentId: data.agent_id,
        externalId: data.external_id,
        customerPhone: data.customer_phone,
        status: data.status,
      };
    },

    async close(id: string): Promise<void> {
      if (!supabase) {
        console.warn(`[db.conversations.close] stub id=${id}`);
        return;
      }
      const { error } = await supabase
        .from('conversations')
        .update({ status: 'closed' })
        .eq('id', id);
      if (error) throw error;
    },
  },

  messages: {
    async exists(externalMessageId: string): Promise<boolean> {
      if (!supabase) return false;
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('external_id', externalMessageId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async listByConversation(
      conversationId: string,
    ): Promise<Array<{ role: string; content: string }>> {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    async save(msg: {
      conversationId: string;
      role: string;
      content: string;
      externalId?: string;
      toolCallId?: string;
      toolName?: string;
      tokensIn?: number;
      tokensOut?: number;
      cacheHit?: boolean;
    }): Promise<void> {
      if (!supabase) {
        console.debug(`[db.messages.save] stub role=${msg.role}`);
        return;
      }
      const { error } = await supabase.from('messages').insert({
        conversation_id: msg.conversationId,
        role: msg.role,
        content: msg.content,
        external_id: msg.externalId ?? null,
        tool_call_id: msg.toolCallId ?? null,
        tool_name: msg.toolName ?? null,
        tokens_in: msg.tokensIn ?? null,
        tokens_out: msg.tokensOut ?? null,
        cache_hit: msg.cacheHit ?? false,
      });
      // Conflito de external_id (dedup) é OK — não propagar
      if (error && !error.message.includes('duplicate key')) throw error;
    },
  },

  executions: {
    async save(exec: {
      agentId: string;
      conversationId: string;
      customerPhone: string;
      customerName?: string;
      status: 'resolved' | 'escalated' | 'failed';
      toolsUsed: string[];
      responseTimeMs: number;
      totalTokens: number;
      cacheReadTokens: number;
      costUsd?: number;
    }): Promise<void> {
      if (!supabase) {
        console.debug(`[db.executions.save] stub status=${exec.status}`);
        return;
      }
      const { error } = await supabase.from('executions').insert({
        agent_id: exec.agentId,
        conversation_id: exec.conversationId,
        customer_phone: exec.customerPhone,
        customer_name: exec.customerName ?? null,
        status: exec.status,
        tools_used: exec.toolsUsed,
        response_time_ms: exec.responseTimeMs,
        total_tokens: exec.totalTokens,
        cache_read_tokens: exec.cacheReadTokens,
        cost_usd: exec.costUsd ?? 0,
      });
      if (error) throw error;
    },
  },

  escalations: {
    async create(esc: {
      agentId: string;
      conversationId: string;
      customerPhone: string;
      customerName?: string;
      reason: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
    }): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase.from('escalations').insert({
        agent_id: esc.agentId,
        conversation_id: esc.conversationId,
        customer_phone: esc.customerPhone,
        customer_name: esc.customerName ?? null,
        reason: esc.reason,
        priority: esc.priority ?? 'medium',
      });
      if (error) throw error;
    },

    async resolve(id: string): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('escalations')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
  },
};
