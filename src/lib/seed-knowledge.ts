/**
 * Seed mock — Knowledge Base (Fase 1).
 *
 * Bases de conhecimento por workspace. Cada base reúne sources
 * (PDF, URL, sheet, notion, gdrive) que são chunked + embedded
 * pra retrieval semântico via pgvector.
 *
 * Backend real fica em supabase/functions/knowledge-ingest +
 * tabela knowledge_chunks (vector(1536)). Aqui é só UI mock.
 */

export type KnowledgeSourceType =
  | 'pdf'
  | 'url'
  | 'sheet'
  | 'notion'
  | 'gdrive'
  | 'text';

export type KnowledgeSourceStatus =
  | 'idle'
  | 'ingesting'
  | 'ready'
  | 'failed'
  | 'stale';

export interface KnowledgeSource {
  id: string;
  baseId: string;
  type: KnowledgeSourceType;
  title: string;
  uri: string;
  status: KnowledgeSourceStatus;
  chunks: number;
  tokens: number;
  lastSyncedAt: string;
  error?: string;
}

export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  attachedAgentIds: string[];
  totalChunks: number;
  totalTokens: number;
  sizeMB: number;
  visibility: 'workspace' | 'private';
  lastQueryAt?: string;
  queryCount30d: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeQueryLog {
  id: string;
  baseId: string;
  agentId?: string;
  query: string;
  topK: number;
  hits: number;
  latencyMs: number;
  timestamp: string;
}

export const SEED_KNOWLEDGE_BASES: KnowledgeBase[] = [
  {
    id: 'kb_texnet_planos',
    workspaceId: 'ws_texnet',
    name: 'Planos TexNet',
    description: 'Catálogo de planos PF/PJ, preços, regras de fidelidade e área de cobertura.',
    embeddingModel: 'text-embedding-3-small',
    chunkSize: 800,
    chunkOverlap: 120,
    attachedAgentIds: ['agent_bianca', 'agent_marcos'],
    totalChunks: 412,
    totalTokens: 287_400,
    sizeMB: 4.8,
    visibility: 'workspace',
    lastQueryAt: '2026-05-16T11:42:00Z',
    queryCount30d: 8_412,
    createdAt: '2026-03-02T14:20:00Z',
    updatedAt: '2026-05-12T09:11:00Z',
  },
  {
    id: 'kb_texnet_faq',
    workspaceId: 'ws_texnet',
    name: 'FAQ Suporte N1',
    description: 'Procedimentos de troubleshooting, reset de equipamentos e diagnóstico de lentidão.',
    embeddingModel: 'text-embedding-3-small',
    chunkSize: 600,
    chunkOverlap: 80,
    attachedAgentIds: ['agent_renata'],
    totalChunks: 218,
    totalTokens: 142_900,
    sizeMB: 2.1,
    visibility: 'workspace',
    lastQueryAt: '2026-05-16T10:58:00Z',
    queryCount30d: 12_780,
    createdAt: '2026-02-18T10:00:00Z',
    updatedAt: '2026-05-09T15:30:00Z',
  },
  {
    id: 'kb_thribus_pitch',
    workspaceId: 'ws_thribus',
    name: 'Thribus — Pitch & Cases',
    description: 'Material comercial: cases de cliente, ROI por vertical, FAQ pra leads enterprise.',
    embeddingModel: 'text-embedding-3-large',
    chunkSize: 1000,
    chunkOverlap: 150,
    attachedAgentIds: [],
    totalChunks: 89,
    totalTokens: 71_200,
    sizeMB: 1.3,
    visibility: 'workspace',
    queryCount30d: 240,
    createdAt: '2026-04-10T18:45:00Z',
    updatedAt: '2026-05-14T22:10:00Z',
  },
];

export const SEED_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    id: 'src_1',
    baseId: 'kb_texnet_planos',
    type: 'sheet',
    title: 'planos-pf-2026.xlsx',
    uri: 'gdrive://texnet/planos/planos-pf-2026.xlsx',
    status: 'ready',
    chunks: 124,
    tokens: 84_200,
    lastSyncedAt: '2026-05-12T09:11:00Z',
  },
  {
    id: 'src_2',
    baseId: 'kb_texnet_planos',
    type: 'sheet',
    title: 'planos-pj-2026.xlsx',
    uri: 'gdrive://texnet/planos/planos-pj-2026.xlsx',
    status: 'ready',
    chunks: 96,
    tokens: 64_500,
    lastSyncedAt: '2026-05-12T09:11:00Z',
  },
  {
    id: 'src_3',
    baseId: 'kb_texnet_planos',
    type: 'pdf',
    title: 'cobertura-mapa-fibra-q1-2026.pdf',
    uri: 'box://texnet/operacoes/cobertura-q1.pdf',
    status: 'ready',
    chunks: 192,
    tokens: 138_700,
    lastSyncedAt: '2026-05-08T14:22:00Z',
  },
  {
    id: 'src_4',
    baseId: 'kb_texnet_planos',
    type: 'notion',
    title: 'Política de Fidelidade',
    uri: 'notion://texnet/comercial/fidelidade',
    status: 'stale',
    chunks: 0,
    tokens: 0,
    lastSyncedAt: '2026-04-30T11:00:00Z',
    error: 'Conteúdo mudou desde último sync — rode reindex.',
  },
  {
    id: 'src_5',
    baseId: 'kb_texnet_faq',
    type: 'url',
    title: 'suporte.texnet.com.br/ajuda',
    uri: 'https://suporte.texnet.com.br/ajuda',
    status: 'ready',
    chunks: 218,
    tokens: 142_900,
    lastSyncedAt: '2026-05-09T15:30:00Z',
  },
  {
    id: 'src_6',
    baseId: 'kb_thribus_pitch',
    type: 'pdf',
    title: 'pitch-deck-enterprise-v3.pdf',
    uri: 'box://thribus/comercial/pitch-v3.pdf',
    status: 'ready',
    chunks: 42,
    tokens: 31_800,
    lastSyncedAt: '2026-05-14T22:10:00Z',
  },
  {
    id: 'src_7',
    baseId: 'kb_thribus_pitch',
    type: 'text',
    title: 'Case TexNet — fechamento Q1',
    uri: 'inline://case-texnet-q1',
    status: 'ready',
    chunks: 47,
    tokens: 39_400,
    lastSyncedAt: '2026-05-14T22:10:00Z',
  },
  {
    id: 'src_8',
    baseId: 'kb_texnet_faq',
    type: 'pdf',
    title: 'manual-roteador-huawei-eg8145v5.pdf',
    uri: 'box://texnet/equipamentos/huawei-eg8145v5.pdf',
    status: 'ingesting',
    chunks: 0,
    tokens: 0,
    lastSyncedAt: '2026-05-16T11:30:00Z',
  },
];

export const SEED_KNOWLEDGE_QUERIES: KnowledgeQueryLog[] = [
  { id: 'q1', baseId: 'kb_texnet_planos', agentId: 'agent_bianca', query: 'plano de 600 mega tem fidelidade?', topK: 4, hits: 4, latencyMs: 118, timestamp: '2026-05-16T11:42:00Z' },
  { id: 'q2', baseId: 'kb_texnet_planos', agentId: 'agent_bianca', query: 'tem cobertura no bairro Centro de Bagé?', topK: 4, hits: 3, latencyMs: 142, timestamp: '2026-05-16T11:38:00Z' },
  { id: 'q3', baseId: 'kb_texnet_faq', agentId: 'agent_renata', query: 'wifi lento à noite, o que fazer?', topK: 6, hits: 6, latencyMs: 96, timestamp: '2026-05-16T10:58:00Z' },
  { id: 'q4', baseId: 'kb_texnet_planos', agentId: 'agent_marcos', query: 'desconto pra cliente PJ acima de 1Gbps', topK: 4, hits: 2, latencyMs: 188, timestamp: '2026-05-16T10:11:00Z' },
  { id: 'q5', baseId: 'kb_texnet_faq', agentId: 'agent_renata', query: 'resetar roteador huawei', topK: 4, hits: 4, latencyMs: 102, timestamp: '2026-05-16T09:45:00Z' },
];
