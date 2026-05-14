import { MessageSquare, Bot, Users, Hash, Paperclip, Hourglass } from 'lucide-react';

export function EnterpriseTalki() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center gap-3">
        <Hourglass size={20} className="text-amber-200 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-amber-100">Talki — Preview</div>
          <p className="text-[12.5px] text-amber-200/80 mt-0.5">
            Backend schema (<code className="font-mono">cortex_talki_threads</code> +{' '}
            <code className="font-mono">cortex_talki_messages</code>) já reservado. Runtime de
            chat em tempo real chega na próxima iteração.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand-bright flex items-center justify-center">
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-creme">Chat colaborativo + agentes</h2>
            <p className="text-[13.5px] text-creme-mute mt-1 max-w-2xl leading-relaxed">
              Talki vai unir humanos da equipe e agentes Cortex no mesmo chat. Threads diretas,
              canais por projeto, e bots que escutam menções pra acionar Bianca/Renata/Marcos/Carla.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Feature icon={Users} title="Threads diretas" desc="1:1 entre membros do tenant" />
          <Feature icon={Hash} title="Canais" desc="Por equipe, projeto ou cliente" />
          <Feature icon={Bot} title="Agentes integrados" desc="Mencione @bianca pra acionar" />
          <Feature icon={Paperclip} title="Attachments" desc="Imagens, PDFs, áudios" />
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-5">
        <h3 className="text-[14px] font-bold text-creme mb-2">Como vai funcionar</h3>
        <ol className="text-[13px] text-creme-mute space-y-2 list-decimal list-inside leading-relaxed">
          <li>
            Mensagem do humano vai pro thread → todos os membros recebem via WebSocket
          </li>
          <li>
            Menção a <code className="font-mono text-creme">@agent</code> aciona o Brain via{' '}
            <code className="font-mono text-creme">/cortex/analyze</code> com o thread como sessão
          </li>
          <li>
            Resposta do agente aparece no thread com o ícone do colaborador correspondente
          </li>
          <li>Audit log + custo continuam fluindo pro sistema Cortex normal</li>
        </ol>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof MessageSquare;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-2 p-3.5">
      <Icon size={16} className="text-brand-bright mb-2" />
      <div className="text-[13px] font-bold text-creme">{title}</div>
      <div className="text-[11.5px] text-creme-mute mt-0.5">{desc}</div>
    </div>
  );
}
