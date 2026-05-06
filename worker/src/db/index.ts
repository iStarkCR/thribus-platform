/**
 * DB layer — abstração sobre Postgres (Supabase)
 *
 * Status: STUB — todos os métodos retornam dados fake ou no-op.
 *
 * Para conectar ao Supabase:
 *   1. Instale: npm i pg
 *   2. Defina DATABASE_URL no .env
 *   3. Substitua cada // TODO pelo query real usando o pool abaixo
 *   4. Crie as tabelas com o SQL em db/schema.sql
 *
 * Alternativa: usar o Supabase JS client diretamente.
 *   npm i @supabase/supabase-js
 */

// import pg from 'pg';
// const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Tipos espelho dos types do frontend ─────────────────────────────────────

interface AgentRecord {
  id: string;
  name: string;
  client: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  channel?: string;  // Slug do canal TexNet CRM — mapeado na tabela agents
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

// ─── Namespace DB ─────────────────────────────────────────────────────────────

export const db = {

  agents: {
    async findById(id: string): Promise<AgentRecord | null> {
      // TODO: return pool.query('SELECT * FROM agents WHERE id=$1', [id]).then(r => r.rows[0] ?? null);
      console.warn(`[db.agents.findById] stub id=${id}`);
      return null;
    },

    async findByChannel(channel: string): Promise<AgentRecord | null> {
      // TODO: return pool.query('SELECT * FROM agents WHERE channel=$1 LIMIT 1', [channel]).then(r => r.rows[0] ?? null);
      console.warn(`[db.agents.findByChannel] stub channel=${channel}`);
      return null;
    },
  },

  tools: {
    async listByAgent(agentId: string): Promise<ToolRecord[]> {
      // TODO:
      // const agent = await db.agents.findById(agentId);
      // return pool.query(
      //   "SELECT * FROM tools WHERE (scope='global' OR scope=agent.client) AND active=true",
      //   []
      // ).then(r => r.rows);
      console.warn(`[db.tools.listByAgent] stub agentId=${agentId}`);
      return [];
    },

    async findByName(name: string, agentId: string): Promise<ToolRecord | null> {
      // TODO: busca tool pelo nome, filtrando por escopo do agent
      console.warn(`[db.tools.findByName] stub name=${name} agentId=${agentId}`);
      return null;
    },
  },

  conversations: {
    async findOrCreate(opts: {
      externalId: string;
      agentId: string;
      customerPhone: string;
    }): Promise<ConversationRecord> {
      // TODO:
      // const existing = await pool.query(
      //   'SELECT * FROM conversations WHERE external_id=$1 LIMIT 1',
      //   [opts.externalId]
      // ).then(r => r.rows[0]);
      // if (existing) return existing;
      // return pool.query(
      //   'INSERT INTO conversations (id, agent_id, external_id, customer_phone, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      //   [crypto.randomUUID(), opts.agentId, opts.externalId, opts.customerPhone, 'active']
      // ).then(r => r.rows[0]);
      return {
        id: `conv-stub-${opts.externalId}`,
        agentId: opts.agentId,
        externalId: opts.externalId,
        customerPhone: opts.customerPhone,
        status: 'active',
      };
    },

    async close(id: string): Promise<void> {
      // TODO: pool.query("UPDATE conversations SET status='closed' WHERE id=$1", [id]);
      console.warn(`[db.conversations.close] stub id=${id}`);
    },
  },

  messages: {
    async exists(externalMessageId: string): Promise<boolean> {
      // TODO: return pool.query('SELECT 1 FROM messages WHERE external_id=$1', [externalMessageId]).then(r => r.rowCount > 0);
      return false;
    },

    async listByConversation(conversationId: string): Promise<Array<{ role: string; content: string }>> {
      // TODO: return pool.query(
      //   'SELECT role, content FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC',
      //   [conversationId]
      // ).then(r => r.rows);
      return [];
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
      // TODO: pool.query(
      //   'INSERT INTO messages (id, conversation_id, role, content, external_id, tool_call_id, tool_name, tokens_in, tokens_out, cache_hit, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())',
      //   [crypto.randomUUID(), msg.conversationId, msg.role, msg.content, msg.externalId ?? null, ...]
      // );
      console.debug(`[db.messages.save] stub role=${msg.role} conv=${msg.conversationId}`);
    },
  },

  executions: {
    async save(exec: {
      agentId: string;
      conversationId: string;
      customerPhone: string;
      status: 'resolved' | 'escalated' | 'failed';
      toolsUsed: string[];
      responseTimeMs: number;
      totalTokens: number;
      cacheReadTokens: number;
    }): Promise<void> {
      // TODO: INSERT INTO executions ...
      console.debug(`[db.executions.save] stub status=${exec.status} agent=${exec.agentId}`);
    },
  },
};
