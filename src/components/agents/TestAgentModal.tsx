import { useState } from 'react';
import { Play, Activity } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useAppStore } from '@/hooks/useAppStore';
import { agentsApi } from '@/services/api';
import type { TestAgentResponse } from '@/types';

interface Props {
  onClose: () => void;
}

export function TestAgentModal({ onClose }: Props) {
  const agents = useAppStore((s) => s.agents).filter((a) => a.status === 'online');
  const addToast = useAppStore((s) => s.addToast);
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [phone, setPhone] = useState('+55 85 9 8888-7777');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestAgentResponse | null>(null);

  const handleTest = async () => {
    if (!message.trim()) {
      addToast('Digite uma mensagem', 'amber');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await agentsApi.test({ agentId, phoneNumber: phone, message });
      setResult(res);
      addToast(`Teste executado — ${res.toolsUsed.length} tools utilizadas`, 'green');
    } catch {
      addToast('Erro ao executar teste', 'red');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Testar Colaborador"
      subtitle="Simule uma conversa com o colaborador selecionado"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-accent" onClick={handleTest} disabled={loading}>
            {loading ? (
              <><Activity size={13} className="animate-spin" /> Processando...</>
            ) : (
              <><Play size={13} /> Executar</>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Colaborador</label>
          <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.client}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">WhatsApp (simulado)</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div>
          <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Mensagem do Cliente</label>
          <textarea
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex: minha internet tá caindo toda hora desde ontem..."
          />
        </div>

        {result && (
          <div className="mt-4">
            <label className="text-[12.5px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">Resposta</label>
            <div className="bg-surface-2 border border-hover border-l-2 border-l-brand rounded-lg p-3.5 text-[15px] leading-relaxed text-creme-dim">
              {result.response}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {result.toolsUsed.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-[12px] font-mono text-creme-faint">
              <span>{result.responseTime}s</span>
              <span>{result.tokensUsed} tokens</span>
              <span>{result.toolsUsed.length} tools</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
