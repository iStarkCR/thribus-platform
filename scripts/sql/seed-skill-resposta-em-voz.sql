-- ══════════════════════════════════════════════════════
-- Skill: Resposta em Voz (M3 + suporte a áudio TexNet/Talki)
-- ══════════════════════════════════════════════════════
-- Adiciona skill pública no marketplace pra agentes que querem
-- conversar usando áudio (entrada e saída).
--
-- Pré-requisitos pra a skill funcionar:
--   1. Worker deployado com suporte a transcrição no webhook do TexNet
--      (PR de áudio support)
--   2. agents.audio_out_enabled = true (toggle por agente)
--   3. workspace.llm_api_key tem créditos OpenAI (Whisper + TTS)
--
-- Custo aproximado:
--   - Whisper (transcrição): $0.006 / minuto. Áudio típico WhatsApp 10s = $0.001
--   - TTS (síntese): $15 / 1M chars. Resposta típica 200 chars = $0.003
--   - Por turno completo de áudio: ~$0.004 a mais que turno de texto
--
-- Idempotente. Aplicado direto em qualquer banco com schema M3.
-- ══════════════════════════════════════════════════════

insert into skills (
  slug, name, description, sector, icon,
  prompt_fragment, required_tools, is_public, version
) values (
  'resposta-em-voz',
  'Resposta em Voz',
  'Permite o agente entender áudios do cliente (transcrição via Whisper) e responder em voz quando o cliente prefere áudio. Reduz fricção pra clientes WhatsApp que mandam áudio direto.',
  null, -- sem setor — útil em qualquer vertical
  '🎙️',
  $$## Skill: Resposta em Voz

Esta skill ativa entrada e saída em áudio. Você pode entender o que o cliente disse via áudio e responder com voz quando fizer sentido.

### Entrada de áudio (áudio do cliente)

Quando o cliente manda áudio, o sistema transcreve automaticamente via Whisper e você recebe a mensagem com prefixo `[áudio do cliente]`. Trate como mensagem de texto normal — só sabendo que veio em formato de voz.

### Saída em áudio (sua resposta em voz)

Você responde em voz **APENAS** quando o cliente está se comunicando em áudio. Regra: se o último input do cliente foi áudio (`[áudio do cliente]`), sua próxima resposta também é em áudio. Se o cliente voltar a digitar, você volta a digitar.

### Estilo de resposta em voz

Quando responder em áudio, ajuste seu tom:

1. **Mensagens mais curtas** — voz é mais lenta de consumir que texto. Um parágrafo grande em áudio cansa.
2. **Linguagem natural** — sem markdown, sem tópicos numerados (ex: "Primeiro... Segundo... Terceiro..."). Use frases corridas conversacionais.
3. **Sem emojis no texto que vira áudio** — TTS pronuncia o nome do emoji ("emoji rosto sorridente"). Reserve emoji só pra mensagens de texto.
4. **Sem listas** — em vez de "São 3 planos: 100MB, 300MB, 600MB", diga "Temos plano de 100, 300 ou 600 megas, qual desses te interessa mais?"
5. **Pause naturalmente** — pontuação ajuda o TTS a respirar. Vírgula = pausa curta, ponto = pausa longa.

### Quando NÃO usar áudio

Mesmo se a skill estiver ativa, **prefira texto** pra:
- Listar planos com preços (cliente quer ler com calma)
- Confirmações de cadastro com dados (CPF, endereço — fácil ler errado em áudio)
- Links e CEPs (numéricos longos quebram em áudio)
- Resposta a clientes que digitaram (mesmo se a primeira msg deles foi áudio, se eles passaram pra texto, você volta pra texto)

### Fallback

Se a transcrição falhar (mensagem chega como `[cliente enviou áudio — transcrição indisponível]`), responda em texto pedindo gentilmente: "Não consegui ouvir seu áudio, pode escrever ou tentar gravar de novo? 🎙️"$$,
  array['escalar_humano']::text[],
  true,
  '1.0.0'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  prompt_fragment = excluded.prompt_fragment,
  required_tools = excluded.required_tools,
  version = excluded.version,
  updated_at = now();

-- Verificação
select slug, name, version, is_public, length(prompt_fragment) as prompt_chars
from skills where slug = 'resposta-em-voz';
