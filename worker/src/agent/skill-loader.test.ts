/**
 * Smoke tests do skill-loader. Não bate em DB real — usa um stub do
 * `db.skills.findEnabledByAgent` injetado via mock minimalista.
 *
 * Roda com:
 *     cd worker && npx tsx src/agent/skill-loader.test.ts
 */

// Stub do módulo db ANTES de importar skill-loader.
// O loader só usa db.skills.findEnabledByAgent, então mockamos só esse.
const mockSkills: Array<{
  skillId: string;
  slug: string;
  name: string;
  promptFragment: string;
  requiredTools: string[];
  config: Record<string, unknown>;
  version: string;
}> = [];

// @ts-expect-error — override de módulo via import.meta.env trick não rola em ESM,
// vamos mockar via re-export depois. Simplificando: monkey-patch direto após import.
import { enrichWithSkills } from './skill-loader.js';
import { db } from '../db/index.js';

// Substitui o método pelo nosso stub
(db as unknown as { skills: { findEnabledByAgent: typeof db.skills.findEnabledByAgent } }).skills.findEnabledByAgent =
  async () => mockSkills;

interface TestCase {
  name: string;
  flagValue: string | undefined;
  skills: typeof mockSkills;
  inputPrompt: string;
  inputTools: string[];
  expectedEnriched: boolean;
  expectedAppliedCount: number;
  /** Verifica que o prompt final contém certas substrings (em ordem). */
  expectedPromptContains?: string[];
  /** Verifica que tools final contém todas estas. */
  expectedToolsContain?: string[];
  /** Verifica que tools final NÃO duplicou. */
  expectedToolsCount?: number;
}

const CASES: TestCase[] = [
  {
    name: 'flag OFF — no-op (preserva prompt e tools)',
    flagValue: undefined,
    skills: [
      {
        skillId: 's1', slug: 'consulta-viabilidade-isp', name: 'X',
        promptFragment: 'extra prompt fragment',
        requiredTools: ['nova_tool'],
        config: {},
        version: '1.0.0',
      },
    ],
    inputPrompt: 'base prompt',
    inputTools: ['existing_tool'],
    expectedEnriched: false,
    expectedAppliedCount: 0,
    expectedPromptContains: ['base prompt'],
    expectedToolsContain: ['existing_tool'],
    expectedToolsCount: 1,
  },
  {
    name: 'flag ON sem skills instaladas — enriched=true mas applied=0',
    flagValue: 'true',
    skills: [],
    inputPrompt: 'base prompt',
    inputTools: ['existing_tool'],
    expectedEnriched: true,
    expectedAppliedCount: 0,
    expectedPromptContains: ['base prompt'],
    expectedToolsContain: ['existing_tool'],
    expectedToolsCount: 1,
  },
  {
    name: 'flag ON com 1 skill — apenda fragment + adiciona tool',
    flagValue: 'true',
    skills: [
      {
        skillId: 's1', slug: 'consulta-viabilidade-isp', name: 'X',
        promptFragment: '## Skill: Consulta de Viabilidade\nRegras...',
        requiredTools: ['consultar_viabilidade'],
        config: {},
        version: '1.0.0',
      },
    ],
    inputPrompt: 'base prompt',
    inputTools: ['existing_tool'],
    expectedEnriched: true,
    expectedAppliedCount: 1,
    expectedPromptContains: ['base prompt', 'Consulta de Viabilidade'],
    expectedToolsContain: ['existing_tool', 'consultar_viabilidade'],
    expectedToolsCount: 2,
  },
  {
    name: 'flag ON com 2 skills + tool duplicada — dedup funciona',
    flagValue: 'true',
    skills: [
      {
        skillId: 's1', slug: 'consulta-viabilidade-isp', name: 'X',
        promptFragment: 'frag1',
        requiredTools: ['consultar_viabilidade', 'shared_tool'],
        config: {},
        version: '1.0.0',
      },
      {
        skillId: 's2', slug: 'escalacao-humano-padrao', name: 'Y',
        promptFragment: 'frag2',
        requiredTools: ['escalar_humano', 'shared_tool'], // shared_tool repete
        config: {},
        version: '1.0.0',
      },
    ],
    inputPrompt: 'base',
    inputTools: ['existing'],
    expectedEnriched: true,
    expectedAppliedCount: 2,
    // Ordem alfabética dos slugs: consulta-viabilidade-isp vem antes de escalacao-humano-padrao
    expectedPromptContains: ['base', 'frag1', 'frag2'],
    expectedToolsContain: ['existing', 'consultar_viabilidade', 'shared_tool', 'escalar_humano'],
    expectedToolsCount: 4, // dedup remove repetição de shared_tool
  },
  {
    name: 'skill com prompt_fragment vazio — não adiciona bloco vazio',
    flagValue: 'true',
    skills: [
      {
        skillId: 's1', slug: 'empty-skill', name: 'Empty',
        promptFragment: '   ', // só whitespace
        requiredTools: ['some_tool'],
        config: {},
        version: '1.0.0',
      },
    ],
    inputPrompt: 'base',
    inputTools: [],
    expectedEnriched: true,
    expectedAppliedCount: 1,
    expectedPromptContains: ['base'],
    expectedToolsContain: ['some_tool'],
    expectedToolsCount: 1,
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

console.log('─'.repeat(70));
console.log('Skill loader smoke tests');
console.log('─'.repeat(70));

for (const tc of CASES) {
  // Setup: mock skills + flag
  mockSkills.length = 0;
  mockSkills.push(...tc.skills);
  if (tc.flagValue === undefined) {
    delete process.env.M3_SKILLS_ENABLED;
  } else {
    process.env.M3_SKILLS_ENABLED = tc.flagValue;
  }

  const result = await enrichWithSkills({
    agentId: 'agent-test',
    systemPrompt: tc.inputPrompt,
    tools: tc.inputTools,
  });

  let testOk = true;
  const errors: string[] = [];

  if (result.enriched !== tc.expectedEnriched) {
    testOk = false;
    errors.push(`enriched: expected ${tc.expectedEnriched}, got ${result.enriched}`);
  }
  if (result.appliedSkills.length !== tc.expectedAppliedCount) {
    testOk = false;
    errors.push(`appliedSkills.length: expected ${tc.expectedAppliedCount}, got ${result.appliedSkills.length}`);
  }
  if (tc.expectedPromptContains) {
    for (const sub of tc.expectedPromptContains) {
      if (!result.systemPrompt.includes(sub)) {
        testOk = false;
        errors.push(`systemPrompt missing substring: "${sub}"`);
      }
    }
  }
  if (tc.expectedToolsContain) {
    for (const t of tc.expectedToolsContain) {
      if (!result.tools.includes(t)) {
        testOk = false;
        errors.push(`tools missing: "${t}"`);
      }
    }
  }
  if (tc.expectedToolsCount !== undefined && result.tools.length !== tc.expectedToolsCount) {
    testOk = false;
    errors.push(`tools.length: expected ${tc.expectedToolsCount}, got ${result.tools.length} (${JSON.stringify(result.tools)})`);
  }

  const icon = testOk ? '✓' : '✗';
  console.log(`${icon} ${tc.name}`);
  if (!testOk) {
    for (const e of errors) console.log(`    ! ${e}`);
    failures.push(tc.name);
    failed++;
  } else {
    passed++;
  }
}

// Cleanup env
delete process.env.M3_SKILLS_ENABLED;

console.log('─'.repeat(70));
console.log(`Resultado: ${passed}/${CASES.length} ok, ${failed} falhas`);
if (failed > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('Tudo passou ✓');
