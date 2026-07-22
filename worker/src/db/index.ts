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

/** Papel do agente — usado pelo roteador (M2) pra direcionar conversas. */
export type AgentRole = 'sales' | 'support' | 'finance' | 'retention' | 'generic';

interface AgentRecord {
  id: string;
  name: string;
  client: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  channel?: string;
  workspaceId?: string;
  /** Se true, agente pode responder em áudio (TTS) quando o usuário envia áudio. */
  audioOutEnabled?: boolean;
  /** Papel do agente (vendas/suporte/financeiro/etc) — M2. */
  role?: AgentRole;
}

/**
 * Config do roteador multi-agente do workspace (M2).
 * Quando enabled=true, o worker classifica a 1ª msg da conversa via LLM
 * e direciona pro agent_id correspondente em `intents`.
 */
export interface RouterConfig {
  enabled: boolean;
  model?: string;
  router_prompt: string;
  intents: Record<string, string>; // intent → agent_id
  fallback_agent_id?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  llmProvider: 'openai' | 'anthropic';
  /**
   * @deprecated — usar `anthropicApiKey` ou `openaiApiKey`. Mantido como
   * fallback pra retrocompat (workspaces antigos) — o helper `pickApiKey`
   * usa essa coluna se a chave do provider específico estiver vazia.
   */
  llmApiKey?: string;
  /** API key Anthropic — usada pra modelos com prefixo claude-. */
  anthropicApiKey?: string;
  /** API key OpenAI — usada pra modelos com prefixo gpt-, o1-, o3-, whisper-, tts-. */
  openaiApiKey?: string;
  crmProvider?: 'talki' | 'texnet';
  crmBaseUrl?: string;
  crmAccountId?: string;
  crmApiToken?: string;
  texnetBotSenderId?: string;
  talkiRequiredLabel?: string;
  /**
   * Cofre de credenciais do cliente (tokens, hashes, API keys).
   * Tools referenciam por nome simbólico via auth_credentials.*_ref.
   */
  credentials?: Record<string, string>;
  /**
   * Chaves de LLM por agente (subchave `agent_keys` do jsonb `credentials`).
   * Permite que um agente use uma API key própria em vez da chave do workspace.
   * Indexado por `agent.id` → `{ provider, apiKey }`. Ver `pickApiKey`.
   */
  agentKeys?: Record<string, { provider: string; apiKey: string }>;
  /** Config do roteador multi-agente (M2). */
  routerConfig?: RouterConfig;
}

export type ToolAuthType = 'basic' | 'bearer' | 'apikey';

/**
 * Refs pras credenciais do workspace. Formato depende do auth_type:
 *  - basic:  { username_ref, password_ref }
 *  - bearer: { token_ref }
 *  - apikey: { header_name, value_ref }
 */
export interface ToolAuthCredentials {
  username_ref?: string;
  password_ref?: string;
  token_ref?: string;
  header_name?: string;
  value_ref?: string;
}

interface ToolRecord {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  scope: string;
  active: boolean;
  authType?: ToolAuthType;
  authCredentials?: ToolAuthCredentials;
  extraHeaders?: Record<string, string>;
}

interface ConversationRecord {
  id: string;
  agentId: string;
  externalId: string;
  customerPhone: string;
  status: string;
  currentState?: string;
  stateData?: Record<string, unknown>;
}

export type ConversationStateData = Record<string, unknown>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notConfigured(method: string): never {
  throw new Error(
    `[db.${method}] Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em worker/.env`,
  );
}

function rowToWorkspace(data: Record<string, unknown>): WorkspaceRecord {
  const rawCreds = data.credentials;
  const credentials =
    rawCreds && typeof rawCreds === 'object' && !Array.isArray(rawCreds)
      ? (rawCreds as Record<string, string>)
      : undefined;
  const rawAgentKeys = credentials?.agent_keys as unknown;
  const agentKeys =
    rawAgentKeys && typeof rawAgentKeys === 'object' && !Array.isArray(rawAgentKeys)
      ? (rawAgentKeys as Record<string, { provider: string; apiKey: string }>)
      : undefined;
  const rawRouter = data.router_config;
  const routerConfig =
    rawRouter && typeof rawRouter === 'object' && !Array.isArray(rawRouter)
      ? (rawRouter as RouterConfig)
      : undefined;
  return {
    id: data.id as string,
    name: data.name as string,
    llmProvider: data.llm_provider as 'openai' | 'anthropic',
    llmApiKey: (data.llm_api_key as string | null) ?? undefined,
    anthropicApiKey: (data.anthropic_api_key as string | null) ?? undefined,
    openaiApiKey: (data.openai_api_key as string | null) ?? undefined,
    crmProvider: (data.crm_provider as 'talki' | 'texnet' | null) ?? undefined,
    crmBaseUrl: (data.crm_base_url as string | null) ?? undefined,
    crmAccountId: (data.crm_account_id as string | null) ?? undefined,
    crmApiToken: (data.crm_api_token as string | null) ?? undefined,
    texnetBotSenderId: (data.texnet_bot_sender_id as string | null) ?? undefined,
    talkiRequiredLabel: (data.talki_required_label as string | null) ?? undefined,
    credentials,
    agentKeys,
    routerConfig,
  };
}

function rowToTool(data: Record<string, unknown>): ToolRecord {
  const authCreds = data.auth_credentials;
  const extraHdrs = data.extra_headers;
  return {
    id: data.id as string,
    name: data.name as string,
    description: data.description as string,
    endpoint: data.endpoint as string,
    method: data.method as string,
    scope: data.scope as string,
    active: data.active as boolean,
    authType: (data.auth_type as ToolAuthType | null) ?? undefined,
    authCredentials:
      authCreds && typeof authCreds === 'object' && !Array.isArray(authCreds)
        ? (authCreds as ToolAuthCredentials)
        : undefined,
    extraHeaders:
      extraHdrs && typeof extraHdrs === 'object' && !Array.isArray(extraHdrs)
        ? (extraHdrs as Record<string, string>)
        : undefined,
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
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id, audio_out_enabled, role')
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
        audioOutEnabled: data.audio_out_enabled ?? false,
        role: (data.role as AgentRole | null) ?? undefined,
      };
    },

    async findByChannel(channel: string): Promise<AgentRecord | null> {
      if (!supabase) {
        console.warn(`[db.agents.findByChannel] stub channel=${channel}`);
        return null;
      }
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id, audio_out_enabled, role')
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
        audioOutEnabled: data.audio_out_enabled ?? false,
        role: (data.role as AgentRole | null) ?? undefined,
      };
    },

    async listWithChannel(): Promise<AgentRecord[]> {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id, audio_out_enabled, role')
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
        role: (a.role as AgentRole | null) ?? undefined,
      }));
    },

    /**
     * Busca agente do workspace pelo papel (role). Usado pelo roteador
     * (M2) e pela tool `transferir_para_agente` pra resolver papel → agent_id.
     * Retorna o primeiro agente ativo com esse role, ou null se nenhum.
     */
    async findByWorkspaceAndRole(
      workspaceId: string,
      role: AgentRole | string,
    ): Promise<AgentRecord | null> {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client, model, system_prompt, tools, channel, workspace_id, audio_out_enabled, role')
        .eq('workspace_id', workspaceId)
        .eq('role', role)
        .neq('status', 'offline')
        .limit(1)
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
        audioOutEnabled: data.audio_out_enabled ?? false,
        role: (data.role as AgentRole | null) ?? undefined,
      };
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

    /**
     * Resolve o workspace de um agent. Usado pelo dispatcher de tools pra
     * carregar `credentials` na hora de executar. Retorna null se o agent
     * não tem workspace_id (legado) ou se o workspace foi removido.
     */
    async findByAgentId(agentId: string): Promise<WorkspaceRecord | null> {
      if (!supabase) return null;
      const { data: agentRow, error: agentErr } = await supabase
        .from('agents')
        .select('workspace_id')
        .eq('id', agentId)
        .maybeSingle();
      if (agentErr) throw agentErr;
      const wsId = agentRow?.workspace_id;
      if (!wsId) return null;
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', wsId)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToWorkspace(data) : null;
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

      // Tools cujo nome está em agent.tools E (scope=global OU scope=client).
      // Match de scope é case-insensitive — assim "Texnet"/"TexNet"/"texnet"
      // funcionam todos sem o bug antigo de capitalização.
      const allowedNames: string[] = agentRow.tools ?? [];
      if (allowedNames.length === 0) return [];

      const { data, error } = await supabase
        .from('tools')
        .select('id, name, description, endpoint, method, scope, active, auth_type, auth_credentials, extra_headers')
        .in('name', allowedNames)
        .eq('active', true)
        .or(`scope.eq.global,scope.ilike.${agentRow.client}`);
      if (error) throw error;
      return (data ?? []).map((row) => rowToTool(row as Record<string, unknown>));
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
        .select('id, name, description, endpoint, method, scope, active, auth_type, auth_credentials, extra_headers')
        .eq('name', name)
        .eq('active', true)
        .or(`scope.eq.global,scope.ilike.${client}`)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToTool(data as Record<string, unknown>) : null;
    },
  },

  skills: {
    /**
     * Carrega skills habilitadas pra um agente. Retorna empty se:
     *  - tabela `agent_skills` não existe (migration 008 não aplicada) — degrada
     *    silenciosamente pra não bloquear o loop em ambientes sem M3
     *  - agente não tem nenhuma skill instalada
     *
     * O retorno já vem com `prompt_fragment` e `required_tools` da skill base
     * + `config` da instância (override do agent_skills.config sobre defaults).
     */
    async findEnabledByAgent(agentId: string): Promise<Array<{
      skillId: string;
      slug: string;
      name: string;
      promptFragment: string;
      requiredTools: string[];
      config: Record<string, unknown>;
      version: string;
    }>> {
      if (!supabase) return [];

      try {
        // Join via FK — pega skill + config do agent_skill numa query só
        const { data, error } = await supabase
          .from('agent_skills')
          .select(`
            config,
            enabled,
            skills:skill_id (
              id,
              slug,
              name,
              prompt_fragment,
              required_tools,
              version
            )
          `)
          .eq('agent_id', agentId)
          .eq('enabled', true);

        if (error) {
          // Tabela não existe → migration 008 não foi aplicada ainda. Não é fatal.
          if (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')) {
            console.warn('[db.skills] tabela agent_skills não existe (migration 008 não aplicada). Skills desabilitadas.');
            return [];
          }
          throw error;
        }

        return (data ?? [])
          .map((row) => {
            // skills vem como objeto único quando o relacionamento é 1:1 via FK,
            // mas o supabase-js pode retornar como array dependendo do hint
            const skill = Array.isArray(row.skills) ? row.skills[0] : row.skills;
            if (!skill) return null;
            return {
              skillId: skill.id as string,
              slug: skill.slug as string,
              name: skill.name as string,
              promptFragment: (skill.prompt_fragment as string) ?? '',
              requiredTools: (skill.required_tools as string[]) ?? [],
              config: (row.config as Record<string, unknown>) ?? {},
              version: (skill.version as string) ?? '1.0.0',
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
      } catch (err) {
        console.warn('[db.skills] falha ao carregar skills, prosseguindo sem:', err);
        return [];
      }
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
        .select('id, agent_id, external_id, customer_phone, status, current_state, state_data')
        .eq('external_id', opts.externalId)
        .maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          agentId: existing.agent_id,
          externalId: existing.external_id,
          customerPhone: existing.customer_phone,
          status: existing.status,
          currentState: existing.current_state ?? '1_welcome',
          stateData: (existing.state_data as ConversationStateData) ?? {},
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
          current_state: '1_welcome',
          state_data: {},
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
        currentState: data.current_state ?? '1_welcome',
        stateData: (data.state_data as ConversationStateData) ?? {},
      };
    },

    async setState(
      id: string,
      currentState: string,
      stateDataMerge?: ConversationStateData,
    ): Promise<void> {
      if (!supabase) {
        console.warn(`[db.conversations.setState] stub id=${id} state=${currentState}`);
        return;
      }
      const update: Record<string, unknown> = {
        current_state: currentState,
        state_updated_at: new Date().toISOString(),
      };
      // Se passou stateDataMerge, faz merge com o state_data existente
      if (stateDataMerge) {
        const { data: current } = await supabase
          .from('conversations')
          .select('state_data')
          .eq('id', id)
          .maybeSingle();
        const existing = (current?.state_data as ConversationStateData) ?? {};
        update.state_data = { ...existing, ...stateDataMerge };
      }
      const { error } = await supabase
        .from('conversations')
        .update(update)
        .eq('id', id);
      if (error) throw error;
    },

    /**
     * Transfere a conversa pra outro agente do mesmo workspace (M2).
     * Atualiza agent_id + grava trilha (transferred_from_agent_id, transferred_at, transfer_reason)
     * pra auditoria. Próximo turno o loop pega o agente novo e segue conversa
     * com histórico preservado.
     */
    async transferToAgent(
      conversationId: string,
      newAgentId: string,
      fromAgentId: string,
      reason: string,
    ): Promise<void> {
      if (!supabase) {
        console.warn(`[db.conversations.transferToAgent] stub conv=${conversationId} → agent=${newAgentId}`);
        return;
      }
      const { error } = await supabase
        .from('conversations')
        .update({
          agent_id: newAgentId,
          transferred_from_agent_id: fromAgentId,
          transferred_at: new Date().toISOString(),
          transfer_reason: reason.slice(0, 500),
        })
        .eq('id', conversationId);
      if (error) throw error;

      // Trilha no painel (agent_handoffs) — fire-and-forget
      void (async () => {
        const [{ data: conv }, { data: agentsRows }] = await Promise.all([
          supabase!
            .from('conversations')
            .select('customer_name, customer_phone')
            .eq('id', conversationId)
            .maybeSingle(),
          supabase!
            .from('agents')
            .select('id, name, workspace_id')
            .in('id', [newAgentId, fromAgentId]),
        ]);
        const fromAgent = agentsRows?.find((a) => a.id === fromAgentId);
        const toAgent = agentsRows?.find((a) => a.id === newAgentId);
        const workspaceId = toAgent?.workspace_id ?? fromAgent?.workspace_id;
        if (!workspaceId) return;
        const { error: hErr } = await supabase!.from('agent_handoffs').insert({
          workspace_id: workspaceId,
          conversation_id: conversationId,
          customer_name: conv?.customer_name ?? conv?.customer_phone ?? 'desconhecido',
          from_agent_id: fromAgentId,
          from_agent_name: fromAgent?.name ?? fromAgentId,
          to_agent_id: newAgentId,
          to_agent_name: toAgent?.name ?? newAgentId,
          reason: reason.slice(0, 500),
          context_preserved: true,
        });
        if (hErr) console.warn('[db.conversations.transferToAgent] handoff log falhou:', hErr.message);
      })().catch((err) =>
        console.warn('[db.conversations.transferToAgent] handoff log falhou:', (err as Error).message),
      );
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

    /** Bulk-insert: usado quando o worker hidrata a primeira vez do CRM. */
    async bulkSave(
      conversationId: string,
      msgs: Array<{
        role: string;
        content: string;
        externalId?: string;
        createdAt?: string;
      }>,
    ): Promise<void> {
      if (!supabase || msgs.length === 0) return;
      const rows = msgs.map((m) => ({
        conversation_id: conversationId,
        role: m.role,
        content: m.content,
        external_id: m.externalId ?? null,
        created_at: m.createdAt ?? new Date().toISOString(),
      }));
      const { error } = await supabase.from('messages').insert(rows);
      if (error && !error.message.includes('duplicate key')) {
        console.warn(`[db.messages.bulkSave] erro:`, error.message);
      }
    },

    /**
     * Apaga todas as mensagens de uma conversa.
     * Usado pra cleanup quando atendimento termina (estado terminal):
     * o histórico permanece no CRM como source of truth final, e o nosso
     * DB fica enxuto.
     */
    async deleteAllForConversation(conversationId: string): Promise<number> {
      if (!supabase) return 0;
      const { error, count } = await supabase
        .from('messages')
        .delete({ count: 'exact' })
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return count ?? 0;
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
