/**
 * Transcrição da conversa — vê tudo em texto, copia ou baixa .md.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, FileText, Copy, Download, Check, Loader2 } from 'lucide-react';
import { listMessages, type ChatMessage } from '@/services/collaboratorChat';

const fmtTs = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function TranscriptModal({ sessionId, title, agentName, onClose }: { sessionId: string; title: string; agentName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    listMessages(sessionId)
      .then((m) => { if (alive) setMessages(m.filter((x) => x.status === 'done' || x.role === 'user')); })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [sessionId]);

  const markdown = useMemo(() => {
    if (!messages) return '';
    const head = `# ${title}\n\n`;
    return head + messages.map((m) => {
      const who = m.role === 'user' ? 'Você' : agentName;
      return `**${who}** · ${fmtTs(m.createdAt)}\n\n${m.content}`;
    }).join('\n\n---\n\n') + '\n';
  }, [messages, title, agentName]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignora */ }
  };

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'conversa'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default shrink-0 gap-3">
          <div className="text-[15px] font-bold text-creme flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-brand shrink-0" /> <span className="truncate">Transcrição — {title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={copy} disabled={!messages} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-default text-[12px] text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors disabled:opacity-40" title="Copiar markdown">
              {copied ? <><Check size={13} className="text-brand-bright" /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button onClick={download} disabled={!messages} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-default text-[12px] text-creme-mute hover:text-creme hover:bg-surface-hover transition-colors disabled:opacity-40" title="Baixar .md">
              <Download size={13} /> Baixar
            </button>
            <button onClick={onClose} className="text-creme-faint hover:text-creme p-1"><X size={17} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="text-[13px] text-semantic-red">Falha ao carregar: {error}</div>
          ) : !messages ? (
            <div className="py-10 flex items-center justify-center text-creme-faint"><Loader2 size={18} className="animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-creme-faint">Conversa vazia.</div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center gap-2 mb-1 text-[11.5px]">
                    <span className={`font-bold ${m.role === 'user' ? 'text-creme-dim' : 'text-brand-bright'}`}>{m.role === 'user' ? 'Você' : agentName}</span>
                    <span className="text-creme-faint">{fmtTs(m.createdAt)}</span>
                  </div>
                  <div className="text-[13px] text-creme-mute whitespace-pre-wrap leading-relaxed">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
