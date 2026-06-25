/**
 * Memória de longo prazo dos colaboradores digitais.
 *
 * Banco: `bukowiski_memory` no Postgres do Coolify (postgres-thribus, VPS Contabo),
 * tabela `memory_facts` (agent_id, category, entity, fact, confidence, active...).
 * O Postgres NÃO é exposto na internet, então a ponte (que roda no Mac) chega nele
 * por um TÚNEL SSH: descobre o IP do container na rede Docker no boot e abre
 * `ssh -L <porta local>:<ip do container>:5432`. O pg client conecta em localhost.
 *
 * Filosofia de custo (ver método no chat): o RECALL entra UMA vez no seed da sessão
 * (cacheado pelo prompt cache; ~zero por turno) e tem TETO de tokens; a ESCRITA pega
 * carona na compactação (input curto, modelo barato). Tudo best-effort: se a memória
 * cair, a ponte segue normal — memória nunca derruba o chat.
 *
 * Env (todas opcionais — sem elas a memória fica desligada e a ponte avisa):
 *   MEMORY_ENABLED=1
 *   MEMORY_SSH_HOST="147.93.131.93"
 *   MEMORY_SSH_USER="root"
 *   MEMORY_SSH_KEY="~/.ssh/thribus_vps"
 *   MEMORY_PG_CONTAINER="postgres-thribus"   # pra descobrir o IP via docker inspect
 *   MEMORY_PG_DB="bukowiski_memory"
 *   MEMORY_PG_USER="postgres"
 *   MEMORY_PG_PASSWORD="..."                 # senha do Postgres (fica só aqui, no Mac)
 *   MEMORY_LOCAL_PORT="6543"                 # porta local do túnel
 *   MEMORY_RECALL_LIMIT="40"                 # nº máx de fatos no recall
 *   MEMORY_RECALL_MAXCHARS="2000"            # teto de chars do bloco de memória
 */

import { spawn, execFile } from 'node:child_process';
import { homedir } from 'node:os';
import pg from 'pg';

const cfg = {
  enabled: process.env.MEMORY_ENABLED === '1',
  sshHost: process.env.MEMORY_SSH_HOST || '147.93.131.93',
  sshUser: process.env.MEMORY_SSH_USER || 'root',
  sshKey: (process.env.MEMORY_SSH_KEY || '~/.ssh/thribus_vps').replace(/^~/, homedir()),
  container: process.env.MEMORY_PG_CONTAINER || 'postgres-thribus',
  db: process.env.MEMORY_PG_DB || 'bukowiski_memory',
  user: process.env.MEMORY_PG_USER || 'postgres',
  password: process.env.MEMORY_PG_PASSWORD || '',
  localPort: Number(process.env.MEMORY_LOCAL_PORT || 6543),
  recallLimit: Number(process.env.MEMORY_RECALL_LIMIT || 40),
  recallMaxChars: Number(process.env.MEMORY_RECALL_MAXCHARS || 2000),
};

let pool = null;
let tunnel = null; // child process do ssh -L
let ready = false;

const sshArgs = (extra) => ['-i', cfg.sshKey, '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes', ...extra];

// IP atual do container na rede Docker (pode mudar a cada restart → descobrir no boot).
function containerIp() {
  return new Promise((resolve, reject) => {
    const fmt = "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}";
    const remote = `docker inspect -f '${fmt}' ${cfg.container}`;
    execFile('ssh', sshArgs([`${cfg.sshUser}@${cfg.sshHost}`, remote]), { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      const ip = String(stdout).trim().split(/\s+/)[0];
      if (!ip) return reject(new Error('IP do container não encontrado'));
      resolve(ip);
    });
  });
}

function openTunnel(ip) {
  return new Promise((resolve, reject) => {
    // -N: sem comando remoto; -L: forward local→container:5432
    const child = spawn('ssh', sshArgs(['-N', '-L', `${cfg.localPort}:${ip}:5432`, `${cfg.sshUser}@${cfg.sshHost}`]), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let settled = false;
    child.stderr.on('data', (d) => { if (!settled) console.error('[memory ssh]', String(d).trim()); });
    child.on('exit', (code) => { if (!settled) { settled = true; reject(new Error(`túnel ssh saiu (code ${code})`)); } ready = false; });
    // dá um tempinho pro forward subir antes de tentar conectar
    setTimeout(() => { if (!settled) { settled = true; resolve(child); } }, 1200);
  });
}

/** Abre túnel + pool. Best-effort: devolve false se não der (ponte segue sem memória). */
export async function initMemory() {
  if (!cfg.enabled) { console.log('[memory] desligada (defina MEMORY_ENABLED=1 + envs)'); return false; }
  if (!cfg.password) { console.error('[memory] sem MEMORY_PG_PASSWORD — desligada'); return false; }
  try {
    const ip = await containerIp();
    tunnel = await openTunnel(ip);
    pool = new pg.Pool({
      host: '127.0.0.1', port: cfg.localPort, database: cfg.db, user: cfg.user, password: cfg.password,
      max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000,
    });
    await pool.query('select 1');
    ready = true;
    console.log(`[memory] no ar · ${cfg.db}.memory_facts via túnel ssh (container ${cfg.container} ${ip}:5432 → localhost:${cfg.localPort})`);
    return true;
  } catch (e) {
    console.error('[memory] init falhou (segue sem memória):', e.message);
    ready = false;
    return false;
  }
}

/**
 * Bloco de memória pro seed do colaborador. Top-N fatos ATIVOS por confiança ×
 * recência, com teto de chars. Devolve '' se vazio/indisponível (nunca lança).
 */
export async function recall(agentId) {
  if (!ready || !pool) return '';
  try {
    const { rows } = await pool.query(
      `select category, entity, fact
         from memory_facts
        where agent_id = $1 and active
        order by confidence desc, updated_at desc
        limit $2`,
      [agentId, cfg.recallLimit],
    );
    if (!rows.length) return '';
    const lines = [];
    let used = 0;
    for (const r of rows) {
      const tag = [r.category, r.entity].filter(Boolean).join(' · ');
      const line = tag ? `- (${tag}) ${r.fact}` : `- ${r.fact}`;
      if (used + line.length > cfg.recallMaxChars) break;
      lines.push(line);
      used += line.length + 1;
    }
    if (!lines.length) return '';
    return `O que você já sabe (memória de longo prazo — use quando ajudar, não repita de volta):\n${lines.join('\n')}`;
  } catch (e) {
    console.error('[memory] recall falhou:', e.message);
    return '';
  }
}

/**
 * Grava fatos novos deduplicando: se já existe um fato igual (mesmo agent_id, texto
 * case-insensitive), só atualiza updated_at/confidence; senão insere. Best-effort.
 * facts: [{ fact, category?, entity?, confidence? }]
 */
export async function saveFacts(agentId, facts) {
  if (!ready || !pool || !Array.isArray(facts) || !facts.length) return 0;
  let n = 0;
  for (const f of facts) {
    const fact = String(f?.fact || '').trim();
    if (!fact || fact.length > 600) continue;
    try {
      const { rowCount } = await pool.query(
        `update memory_facts set updated_at = now(), active = true,
                confidence = greatest(confidence, $3)
          where agent_id = $1 and lower(fact) = lower($2)`,
        [agentId, fact, Number(f?.confidence) || 0.8],
      );
      if (rowCount === 0) {
        await pool.query(
          `insert into memory_facts (agent_id, category, entity, fact, confidence)
           values ($1, $2, $3, $4, $5)`,
          [agentId, f?.category || null, f?.entity || null, fact, Number(f?.confidence) || 0.8],
        );
      }
      n++;
    } catch (e) {
      console.error('[memory] saveFact falhou:', e.message);
    }
  }
  return n;
}

/** Todos os fatos (pra o espelho cortex_memory no Supabase do painel). */
export async function listAllFacts() {
  if (!ready || !pool) return null; // null = indisponível (não confundir com "vazio")
  try {
    const { rows } = await pool.query(
      `select id, agent_id, category, entity, fact, confidence, active, updated_at
         from memory_facts order by id`,
    );
    return rows;
  } catch (e) {
    console.error('[memory] listAllFacts falhou:', e.message);
    return null;
  }
}

/**
 * Aplica uma op vinda do painel (cortex_memory.pending_op) na VPS.
 * op: { pending_op, remote_id, agent_id, category, entity, fact, confidence, active }
 * Devolve { remoteId } no create; {} nos demais. Lança se falhar (o caller trata).
 */
export async function applyOp(op) {
  if (!ready || !pool) throw new Error('memória indisponível');
  if (op.pending_op === 'create') {
    const { rows } = await pool.query(
      `insert into memory_facts (agent_id, category, entity, fact, confidence, active)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [op.agent_id, op.category || null, op.entity || null, String(op.fact || '').trim(),
       Number(op.confidence) || 0.8, op.active !== false],
    );
    return { remoteId: rows[0].id };
  }
  if (op.pending_op === 'update') {
    if (!op.remote_id) return {};
    await pool.query(
      `update memory_facts set category=$2, entity=$3, fact=$4, confidence=$5, active=$6, updated_at=now()
        where id=$1`,
      [op.remote_id, op.category || null, op.entity || null, String(op.fact || '').trim(),
       Number(op.confidence) || 0.8, op.active !== false],
    );
    return {};
  }
  if (op.pending_op === 'delete') {
    if (op.remote_id) await pool.query('delete from memory_facts where id=$1', [op.remote_id]);
    return {};
  }
  throw new Error(`op desconhecida: ${op.pending_op}`);
}

export async function closeMemory() {
  try { await pool?.end(); } catch { /* ok */ }
  try { tunnel?.kill('SIGTERM'); } catch { /* ok */ }
  ready = false;
}

export const memoryReady = () => ready;
