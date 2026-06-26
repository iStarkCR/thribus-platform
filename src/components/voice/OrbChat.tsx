import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Mic, Loader2, AudioLines, Paperclip } from 'lucide-react';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { CortexBrainBar } from '@/components/cortex/CortexBrainBar';
import { Markdown } from '@/components/shared/Markdown';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { uploadAttachment, type Attachment } from '@/services/collaboratorChat';
import { useAppStore } from '@/hooks/useAppStore';
import type { OrbConversation } from '@/hooks/useOrbConversation';

const PANEL_W = 360;
const PANEL_H = 460;

/** Chat popover do Bukowiski — só uma view da conversa (texto + voz) do orbe. */
export function OrbChat({ orb, onClose, conv }: { orb: { x: number; y: number; size: number }; onClose: () => void; conv: OrbConversation }) {
  const { messages, voiceActive, listening, talking, speaking, waiting } = conv;
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: File[]) {
    if (!conv.userId || !files.length) return;
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const att = await uploadAttachment(conv.userId, conv.sessionId, file);
        setAttachments((prev) => [...prev, att]);
      } catch (e) {
        useAppStore.getState().addToast('Falha no anexo: ' + (e as Error).message, 'red');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  // Liga a transcrição do mic (fora do modo voz) ao input.
  useEffect(() => {
    conv.bindInputSink((t) => setInput((cur) => (cur ? `${cur} ${t}` : t)));
    return () => conv.bindInputSink(null);
  }, [conv]);

  const style = useMemo(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = orb.x + orb.size - PANEL_W;
    let top = orb.y - PANEL_H - 10;
    if (top < 12) top = orb.y + orb.size + 10;
    left = Math.min(Math.max(12, left), vw - PANEL_W - 12);
    top = Math.min(Math.max(12, top), vh - PANEL_H - 12);
    return { left, top, width: PANEL_W, height: PANEL_H };
  }, [orb.x, orb.y, orb.size]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const t = input.trim();
    if (!t && attachments.length === 0) return;
    setInput(''); setAttachments([]);
    conv.send(t, attachments);
  };

  return (
    <div className="fixed z-[61] flex flex-col rounded-2xl border border-default bg-surface-1/95 backdrop-blur-md shadow-2xl overflow-hidden" style={style}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-default shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-brand/40 bg-[#0a0f0b] shrink-0">
            <div className="absolute -inset-[14%]"><NeuralSphere className="absolute inset-0" intensity={voiceActive ? 0.85 : 0.3} speedMultiplier={1.4} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={0.55} /></div>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-creme leading-tight">Bukowiski</div>
            <div className="text-[10.5px] text-creme-faint leading-tight">
              {speaking ? 'respondendo…' : waiting ? 'pensando…' : talking ? 'você falando…' : listening ? 'ouvindo…' : voiceActive ? 'modo voz' : 'COO · agente principal'}
            </div>
          </div>
        </div>
        <button onClick={onClose} title="Fechar" className="w-7 h-7 rounded-lg text-creme-faint hover:text-creme hover:bg-surface-hover flex items-center justify-center shrink-0"><X size={15} /></button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-3">
            <div className="relative w-16 h-16 rounded-full overflow-hidden border border-brand/30 bg-[#0a0f0b]">
              <div className="absolute -inset-[14%]"><NeuralSphere className="absolute inset-0" intensity={0.3} speedMultiplier={1.3} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={0.55} /></div>
            </div>
            <div className="text-[12.5px] text-creme-mute">Fale ou escreva. No modo voz, diga <span className="font-semibold text-creme">"Bukowiski off"</span> pra encerrar.</div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand text-white rounded-br-sm' : 'bg-surface-2 text-creme border border-default rounded-bl-sm'}`}>
                {m.attachments?.length > 0 && <MessageAttachments items={m.attachments} />}
                {m.content && (m.role === 'assistant' ? <Markdown text={m.content} /> : m.content)}
              </div>
            </div>
          ))
        )}
        {waiting && (
          <div className="flex justify-start"><div className="px-3 py-2 rounded-2xl bg-surface-2 border border-default text-creme-faint text-[12px] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Bukowiski está pensando…</div></div>
        )}
      </div>

      {/* Entrada */}
      <div className="px-2.5 py-2.5 border-t border-default shrink-0">
        <div className="mb-1.5 px-0.5">
          <CortexBrainBar />
        </div>
        {(attachments.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-1.5 px-0.5">
            {attachments.map((a, i) => (
              <div key={a.path} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-surface-3 border border-default text-[11px] text-creme-dim max-w-[150px]">
                <span>{/^image\//.test(a.mime) ? '🖼️' : /^video\//.test(a.mime) ? '🎬' : '📄'}</span>
                <span className="truncate">{a.name}</span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== i))} className="text-creme-faint hover:text-semantic-red shrink-0"><X size={12} /></button>
              </div>
            ))}
            {uploading > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-3 border border-default text-[11px] text-creme-faint">
                <Loader2 size={11} className="animate-spin" /> enviando {uploading}…
              </div>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <div className="flex items-end gap-1.5 bg-surface-2 border border-default rounded-xl px-2 py-1.5">
          <button onClick={() => fileInputRef.current?.click()} title="Anexar arquivo — img · PDF · vídeo" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-creme-faint hover:text-creme hover:bg-surface-hover transition-colors">
            <Paperclip size={16} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder={listening ? 'Ouvindo… fale agora' : 'Mensagem para o Bukowiski…'}
            className="flex-1 resize-none bg-transparent px-1 py-1 text-[13px] text-creme placeholder-creme-faint focus:outline-none max-h-28"
          />
          {conv.sttSupported && (
            <button onClick={() => (voiceActive ? conv.stopVoice() : conv.startVoice())} title={voiceActive ? 'Parar modo voz' : 'Modo voz'} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${voiceActive ? 'bg-brand/15 text-brand-bright' : listening ? 'bg-semantic-red/15 text-semantic-red animate-pulse' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}>
              {voiceActive ? <AudioLines size={16} className="animate-pulse" /> : <Mic size={16} />}
            </button>
          )}
          <button onClick={submit} disabled={(!input.trim() && attachments.length === 0) || uploading > 0} className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
