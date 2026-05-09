/**
 * Skill loader (M3 runtime)
 *
 * Carrega skills habilitadas de um agente e mescla com a config base:
 *  - prompt_fragment de cada skill é apendado ao system_prompt
 *  - required_tools são unidas ao set de tools do agent (sem duplicar)
 *
 * Feature flag: `M3_SKILLS_ENABLED=true` no env. Default OFF — sem flag,
 * o loader é no-op e o comportamento legado (sem skills) é preservado.
 * Isso garante zero risco pra Bianca em produção até validarmos com
 * skills reais em staging.
 *
 * Defesa em profundidade: o `db.skills.findEnabledByAgent` já degrada
 * silenciosamente se a tabela não existir (migration 008 não aplicada),
 * então mesmo com a flag ligada em ambiente sem schema novo, o sistema
 * continua funcionando.
 */

import { db } from '../db/index.js';

export interface SkillEnrichmentInput {
  agentId: string;
  systemPrompt: string;
  tools: string[];
}

export interface SkillEnrichmentResult {
  /** system_prompt final (base + fragments concatenados). */
  systemPrompt: string;
  /** Set de tools final (base + required_tools de cada skill, deduplicado). */
  tools: string[];
  /** Slugs das skills aplicadas — pra logs/debug. */
  appliedSkills: string[];
  /** True se M3_SKILLS_ENABLED estava ligado e o loader rodou. */
  enriched: boolean;
}

/** Soft cap: skill com prompt_fragment maior que isso emite warning (degrada cache). */
const PROMPT_FRAGMENT_WARN_CHARS = 2000;

function isFlagOn(): boolean {
  const v = process.env.M3_SKILLS_ENABLED?.toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Aplica skills no contexto do agent. Se a flag está OFF ou o agent não tem
 * skills, retorna o input intacto com `enriched=false`.
 */
export async function enrichWithSkills(
  input: SkillEnrichmentInput,
): Promise<SkillEnrichmentResult> {
  if (!isFlagOn()) {
    return {
      systemPrompt: input.systemPrompt,
      tools: input.tools,
      appliedSkills: [],
      enriched: false,
    };
  }

  const skills = await db.skills.findEnabledByAgent(input.agentId);
  if (skills.length === 0) {
    return {
      systemPrompt: input.systemPrompt,
      tools: input.tools,
      appliedSkills: [],
      enriched: true,
    };
  }

  // ─── Mescla prompts ─────────────────────────────────────────────────────────
  // Cada skill vira um bloco demarcado no final do system prompt. O LLM lê
  // o prompt base + skills como instruções complementares. Manter ordem
  // estável (slug asc) ajuda a aproveitar prompt cache da Anthropic.
  const sortedSkills = [...skills].sort((a, b) => a.slug.localeCompare(b.slug));

  const skillBlocks = sortedSkills
    .map((s) => {
      if (!s.promptFragment.trim()) return null;
      if (s.promptFragment.length > PROMPT_FRAGMENT_WARN_CHARS) {
        console.warn(
          `[skill-loader] skill="${s.slug}" tem prompt_fragment de ${s.promptFragment.length} chars (>${PROMPT_FRAGMENT_WARN_CHARS}). Pode degradar cache.`,
        );
      }
      return s.promptFragment.trim();
    })
    .filter((b): b is string => b !== null);

  const systemPrompt = skillBlocks.length > 0
    ? `${input.systemPrompt}\n\n${skillBlocks.join('\n\n')}`
    : input.systemPrompt;

  // ─── Mescla tools ──────────────────────────────────────────────────────────
  // Set garante deduplicação. Tools da skill que já existiam no agent são
  // ignoradas (não dá erro, só não duplicam).
  const toolSet = new Set(input.tools);
  for (const s of sortedSkills) {
    for (const t of s.requiredTools) {
      toolSet.add(t);
    }
  }

  const appliedSkills = sortedSkills.map((s) => s.slug);
  console.log(
    `[skill-loader] agent=${input.agentId} applied=${appliedSkills.length} skills=[${appliedSkills.join(',')}]`,
  );

  return {
    systemPrompt,
    tools: Array.from(toolSet),
    appliedSkills,
    enriched: true,
  };
}
