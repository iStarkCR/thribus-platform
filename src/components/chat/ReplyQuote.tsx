import { X } from 'lucide-react';

/**
 * Citação estilo WhatsApp: barra lateral colorida + rótulo de quem + trecho.
 * Usada no preview acima do composer (`onSurface`, com botão cancelar) e acima
 * da mensagem enviada no histórico (`onBrand` dentro do balão do usuário).
 */
export function ReplyQuote({
  role,
  text,
  agentName = 'Bukowiski',
  variant = 'onSurface',
  onCancel,
}: {
  role: 'user' | 'assistant' | 'system';
  text: string;
  agentName?: string;
  variant?: 'onSurface' | 'onBrand';
  onCancel?: () => void;
}) {
  const who = role === 'user' ? 'Você' : agentName;
  const onBrand = variant === 'onBrand';
  return (
    <div
      className={`flex items-start gap-2 rounded-lg pl-2.5 pr-2 py-1.5 border-l-[3px] ${
        onBrand
          ? 'bg-white/15 border-white/70'
          : 'bg-surface-2 border-brand-bright'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-semibold leading-tight ${onBrand ? 'text-white/90' : 'text-brand-bright'}`}>
          {who}
        </div>
        <div className={`text-[12px] leading-snug truncate ${onBrand ? 'text-white/75' : 'text-creme-mute'}`}>
          {text || '(mensagem)'}
        </div>
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          title="Cancelar resposta"
          className={`shrink-0 rounded p-0.5 ${onBrand ? 'text-white/70 hover:text-white' : 'text-creme-faint hover:text-creme'}`}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
