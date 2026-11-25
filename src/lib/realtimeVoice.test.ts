import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn();
const waitForReply = vi.fn();
const saveVoiceTranscript = vi.fn();
vi.mock('@/services/collaboratorChat', () => ({
  sendMessage: (...a: unknown[]) => sendMessage(...a),
  waitForReply: (...a: unknown[]) => waitForReply(...a),
  saveVoiceTranscript: (...a: unknown[]) => saveVoiceTranscript(...a),
}));
vi.mock('@/services/realtime', () => ({ createRealtimeSession: vi.fn(), OPENAI_REALTIME_CALLS_URL: '' }));

import { RealtimeVoice, buildRealtimeInstructions } from './realtimeVoice';

type Internals = { dc: { readyState: string; send: (s: string) => void }; _onEvent: (e: unknown) => void };

function setup() {
  const sent: Record<string, unknown>[] = [];
  const onEnd = vi.fn();
  const rv = new RealtimeVoice({
    agentId: 'a', userId: 'u', instructions: '',
    ensureSessionId: async () => 's1',
    onEnd,
  });
  const i = rv as unknown as Internals;
  i.dc = { readyState: 'open', send: (s) => sent.push(JSON.parse(s)) };
  return { rv, i, sent, onEnd };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const fnCall = (name: string, args: unknown, call_id = 'c1') => ({
  type: 'response.done',
  response: { output: [{ type: 'function_call', name, call_id, arguments: JSON.stringify(args) }] },
});

describe('RealtimeVoice', () => {
  beforeEach(() => { sendMessage.mockReset(); waitForReply.mockReset(); saveVoiceTranscript.mockReset(); });

  it('delega perguntar_bukowiski ao chat e devolve a resposta como function_call_output', async () => {
    const { i, sent } = setup();
    sendMessage.mockResolvedValue({ id: 'm1', sessionId: 's1', createdAt: 't' });
    waitForReply.mockResolvedValue({ kind: 'done', content: 'VPS ok.\n```json\n{"x":1}\n```' });

    i._onEvent({ type: 'response.created' });
    i._onEvent(fnCall('perguntar_bukowiski', { pedido: 'status da VPS' }));
    await flush(); await flush();

    expect(sendMessage).toHaveBeenCalledWith('s1', 'a', 'u', 'status da VPS', undefined, true);
    const out = sent.find((e) => e.type === 'conversation.item.create') as { item: { call_id: string; output: string } };
    expect(out.item.call_id).toBe('c1');
    expect(JSON.parse(out.item.output).resposta).toBe('VPS ok.\n [bloco omitido]');
    expect(sent[sent.length - 1]).toEqual({ type: 'response.create' });
  });

  it('não pede response.create enquanto outra resposta está ativa; pede no done', async () => {
    const { i, sent } = setup();
    sendMessage.mockResolvedValue({ id: 'm1', sessionId: 's1', createdAt: 't' });
    waitForReply.mockResolvedValue({ kind: 'done', content: 'feito' });

    i._onEvent(fnCall('perguntar_bukowiski', { pedido: 'x' }));
    i._onEvent({ type: 'response.created' }); // usuário puxou outra resposta antes do Claude voltar
    await flush(); await flush();
    expect(sent.some((e) => e.type === 'response.create')).toBe(false);

    i._onEvent({ type: 'response.done', response: { output: [] } });
    expect(sent.filter((e) => e.type === 'response.create')).toHaveLength(1);
  });

  it('runTask anuncia, manda a tarefa como mensagem normal e fala o resultado', async () => {
    const { rv, sent } = setup();
    sendMessage.mockResolvedValue({ id: 'm1', sessionId: 's1', createdAt: 't' });
    waitForReply.mockResolvedValue({ kind: 'done', content: '## Atenção agora\n- caixa ok' });
    const onSent = vi.fn();

    await rv.runTask({ label: 'Briefing do dia', pedido: '[[briefing]] monte', announce: 'avise', speak: 'CHEGOU:', onSent });

    expect(sent[0]).toEqual({ type: 'response.create', response: { instructions: 'avise' } });
    expect(sendMessage).toHaveBeenCalledWith('s1', 'a', 'u', '[[briefing]] monte');
    expect(onSent).toHaveBeenCalledWith('s1');
    const note = sent.find((e) => e.type === 'conversation.item.create') as { item: { role: string; content: { text: string }[] } };
    expect(note.item.role).toBe('system');
    expect(note.item.content[0].text).toContain('CHEGOU:\n\n## Atenção agora');
    expect(sent[sent.length - 1]).toEqual({ type: 'response.create' });
  });

  it('não processa a mesma function_call duas vezes', async () => {
    const { i } = setup();
    sendMessage.mockResolvedValue({ id: 'm1', sessionId: 's1', createdAt: 't' });
    waitForReply.mockResolvedValue({ kind: 'done', content: 'ok' });
    i._onEvent(fnCall('perguntar_bukowiski', { pedido: 'x' }));
    i._onEvent(fnCall('perguntar_bukowiski', { pedido: 'x' }));
    await flush();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('grava transcrições dos dois lados no chat', async () => {
    const { i } = setup();
    i._onEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'oi' });
    i._onEvent({ type: 'response.output_audio_transcript.done', transcript: 'fala, Charles' });
    await flush();
    expect(saveVoiceTranscript).toHaveBeenCalledWith('s1', 'a', 'u', 'user', 'oi');
    expect(saveVoiceTranscript).toHaveBeenCalledWith('s1', 'a', 'u', 'assistant', 'fala, Charles');
  });

  it('legenda acumula os deltas da fala do assistente por resposta', () => {
    const { rv } = setup();
    const caps: { role: string; text: string }[] = [];
    (rv as unknown as { o: { onCaption: (c: { role: string; text: string }) => void } }).o.onCaption = (c) => caps.push(c);
    const i = rv as unknown as Internals;
    i._onEvent({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Fala, ' });
    i._onEvent({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Charles.' });
    i._onEvent({ type: 'response.output_audio_transcript.delta', response_id: 'r2', delta: 'Novo.' });
    expect(caps.map((c) => c.text)).toEqual(['Fala, ', 'Fala, Charles.', 'Novo.']);
  });

  it('encerrar_voz termina a sessão quando o áudio de despedida acaba', () => {
    const { i, onEnd } = setup();
    i._onEvent(fnCall('encerrar_voz', {}));
    i._onEvent({ type: 'output_audio_buffer.started' });
    i._onEvent({ type: 'output_audio_buffer.stopped' });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('buildRealtimeInstructions', () => {
  it('inclui só as últimas 16 falas, sem blocos de código', () => {
    const ctx = Array.from({ length: 20 }, (_, k) => ({ role: (k % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `msg ${k} \`\`\`sql\nselect 1\n\`\`\`` }));
    const s = buildRealtimeInstructions({ userName: 'Charles', context: ctx });
    expect(s).not.toContain('msg 3 ');
    expect(s).toContain('msg 19');
    expect(s).not.toContain('select 1');
  });
});
