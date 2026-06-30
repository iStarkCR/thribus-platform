-- Tom/estilo da voz (campo 'instructions' do gpt-4o-mini-tts da OpenAI): deixa a
-- fala mais expressiva e com personalidade. Ignorado por modelos antigos (tts-1).
alter table agent_voice_config
  add column if not exists instructions text;
