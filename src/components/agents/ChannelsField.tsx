import { useState, type KeyboardEvent } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  channels: string[];
  onChange: (channels: string[]) => void;
}

/**
 * Canal roteável: segmentos separados por `:` (ex: talki:8:121). A validação é
 * deliberadamente frouxa pra NÃO rejeitar canais que já existem no banco. Cobre:
 *   - talki:8:116                              (inbox Talki)
 *   - disabled:talki:5:117                     (canal silenciado — prefixo de controle)
 *   - router:texnet-talki:cobranca-camila      (roteador legado)
 *   - internal:thribus-ui:cobranca-supervisor  (canal interno)
 * Exige ≥1 segmento após um `:`; barra string vazia/whitespace. Melhor frouxa
 * que rejeitar canal válido — o webhook/worker é quem decide o roteamento real.
 */
const CHANNEL_RE = /^[a-z0-9_-]+(:[a-z0-9_.:-]+)+$/i;

export function isValidChannel(c: string): boolean {
  return CHANNEL_RE.test(c.trim());
}

/**
 * Traduz o erro do trigger `agents_channels_no_overlap` (um canal só pode
 * pertencer a 1 colaborador) numa mensagem legível. Retorna null se o erro
 * não for de conflito de canal — aí o chamador usa o fallback genérico.
 * Dispara quando dois agentes tentam o mesmo canal (ex: consolidar a Bianca).
 */
export function channelConflictMessage(err: unknown): string | null {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message ?? '';
  if (e?.code === '23505' || /canal já/i.test(msg)) {
    // A mensagem do trigger já cita o canal — repassa ela se vier legível.
    return msg && /canal/i.test(msg)
      ? msg
      : 'Esse canal já pertence a outro colaborador.';
  }
  return null;
}

/** Campo de chips pra N canais por colaborador (add por Enter, remove por ×). */
export function ChannelsField({ channels, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addChannel = () => {
    const value = draft.trim();
    if (!value) return;
    if (!isValidChannel(value)) {
      setError('Formato inválido. Use segmentos separados por “:” (ex: talki:8:121 ou router:texnet-talki:cobranca-camila).');
      return;
    }
    if (channels.includes(value)) {
      setError(`"${value}" já está na lista deste colaborador.`);
      return;
    }
    onChange([...channels, value]);
    setDraft('');
    setError(null);
  };

  const removeChannel = (value: string) => {
    onChange(channels.filter((c) => c !== value));
    setError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChannel();
    } else if (e.key === 'Backspace' && !draft && channels.length > 0) {
      // Backspace com campo vazio remove o último chip
      removeChannel(channels[channels.length - 1]);
    }
  };

  return (
    <div>
      <div className="input flex flex-wrap items-center gap-1.5 !py-2 min-h-[42px]">
        {channels.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 text-[12px] font-mono font-medium pl-2 pr-1 py-0.5 rounded-md border bg-brand/[0.07] border-brand/20 text-brand-bright/90"
          >
            {c}
            <button
              type="button"
              onClick={() => removeChannel(c)}
              className="text-creme-faint hover:text-semantic-red transition-colors"
              title={`Remover ${c}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[140px] bg-transparent outline-none font-mono text-sm text-creme placeholder:text-creme-faint"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={handleKeyDown}
          onBlur={addChannel}
          placeholder={channels.length === 0 ? 'talki:8:121' : 'adicionar outro…'}
        />
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-[12px] text-semantic-red mt-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      ) : channels.length === 0 ? (
        <p className="flex items-start gap-1.5 text-[12px] text-semantic-amber mt-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>Sem canais — este colaborador não receberá mensagens e some do roteamento.</span>
        </p>
      ) : (
        <p className="text-[12px] text-creme-faint mt-1.5">
          Um colaborador pode atender vários canais. Digite <code className="font-mono text-brand">talki:8:121</code> e
          tecle Enter pra adicionar. É como o webhook roteia mensagens do canal pra este colaborador.
        </p>
      )}
    </div>
  );
}
