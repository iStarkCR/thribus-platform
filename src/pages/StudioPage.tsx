import { useState } from 'react';
import {
  Blocks, Save, Play, Plus, Trash2, GripVertical,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_STUDIO_CANVAS, STUDIO_BLOCK_PALETTE,
  type StudioBlock, type BlockType,
} from '@/lib/seed-studio';

const BLOCK_COLOR: Record<BlockType, string> = {
  persona: 'border-brand/40 bg-brand/10',
  knowledge: 'border-semantic-amber/40 bg-semantic-amber/10',
  tool: 'border-semantic-green/40 bg-semantic-green/10',
  skill: 'border-brand/40 bg-brand/10',
  workflow: 'border-semantic-amber/40 bg-semantic-amber/10',
  channel: 'border-creme-faint/40 bg-surface-3',
  guardrail: 'border-semantic-red/40 bg-semantic-red/10',
  handoff: 'border-brand/40 bg-brand/10',
};

export function StudioPage() {
  const [canvas] = useState(SEED_STUDIO_CANVAS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>('b_1');

  const selected = canvas.blocks.find((b) => b.id === selectedBlockId);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Blocks size={16} className="text-creme-mute" /> Agent Studio
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · no-code builder · {canvas.blocksCount} blocos · {canvas.status === 'published' ? 'publicado' : 'rascunho'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme hover:border-hover transition-all flex items-center gap-1">
            <Play size={11} /> Testar
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
            <Save size={11} /> Publicar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[200px_1fr_300px] gap-3 h-[calc(100vh-160px)] min-h-[500px]">
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-creme-dim">Paleta de blocos</h3>
            <p className="text-[11px] text-creme-faint mt-0.5">arraste pro canvas</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {STUDIO_BLOCK_PALETTE.map((p) => (
              <div
                key={p.type}
                className="p-2 rounded-md bg-surface-1 border border-default hover:border-brand/40 transition-all cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[16px] leading-none">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-creme">{p.label}</div>
                    <div className="text-[10.5px] text-creme-faint leading-tight">{p.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden relative">
          <div className="absolute inset-0 overflow-auto p-6" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            <div className="relative min-w-[820px] min-h-[600px]">
              <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                {canvas.blocks.map((from) =>
                  from.connectsTo.map((toId) => {
                    const to = canvas.blocks.find((b) => b.id === toId);
                    if (!to) return null;
                    const x1 = from.position.x + 120;
                    const y1 = from.position.y + 50;
                    const x2 = to.position.x + 10;
                    const y2 = to.position.y + 50;
                    return <line key={`${from.id}-${toId}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(107,143,94,0.4)" strokeWidth={1.5} strokeDasharray="4 4" />;
                  })
                )}
              </svg>
              {canvas.blocks.map((b) => (
                <CanvasBlock
                  key={b.id}
                  block={b}
                  selected={b.id === selectedBlockId}
                  onClick={() => setSelectedBlockId(b.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default">
            <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim flex items-center gap-1.5">
              <Sparkles size={11} className="text-brand-bright" /> Inspector
            </h3>
          </div>
          {selected ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <Field label="Tipo">
                <code className="text-[12px] font-mono text-brand-bright">{selected.type}</code>
              </Field>
              <Field label="Título">
                <input value={selected.title} readOnly className="w-full px-2 py-1.5 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme focus:outline-none" />
              </Field>
              <Field label="Subtítulo">
                <input value={selected.subtitle} readOnly className="w-full px-2 py-1.5 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme focus:outline-none" />
              </Field>
              <Field label="Configuração">
                <textarea value={selected.configSummary} readOnly rows={3} className="w-full px-2 py-1.5 rounded-md bg-surface-1 border border-default text-[12px] text-creme-mute focus:outline-none resize-none font-mono" />
              </Field>
              <Field label={`Conexões (${selected.connectsTo.length})`}>
                <div className="space-y-1">
                  {selected.connectsTo.length === 0 ? (
                    <p className="text-[11.5px] text-creme-faint italic">Sem conexões.</p>
                  ) : selected.connectsTo.map((cid) => {
                    const target = canvas.blocks.find((b) => b.id === cid);
                    return (
                      <div key={cid} className="px-2 py-1 rounded-md bg-surface-1 border border-default text-[11.5px] text-creme-mute font-mono">
                        → {target?.title ?? cid}
                      </div>
                    );
                  })}
                </div>
              </Field>
              <div className="flex items-center gap-1.5 pt-2 border-t border-default">
                <button className="flex-1 py-1.5 rounded-md bg-surface-3 text-creme-mute hover:bg-surface-hover text-[11.5px] font-semibold inline-flex items-center justify-center gap-1">
                  <Plus size={11} /> Conectar
                </button>
                <button className="px-3 py-1.5 rounded-md bg-semantic-red/15 text-semantic-red hover:bg-semantic-red/25 text-[11.5px] font-semibold inline-flex items-center gap-1">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[12px] text-creme-faint">
              Selecione um bloco
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CanvasBlock({ block, selected, onClick }: { block: StudioBlock; selected: boolean; onClick: () => void }) {
  const paletteEntry = STUDIO_BLOCK_PALETTE.find((p) => p.type === block.type);
  return (
    <button
      onClick={onClick}
      className={clsx(
        'absolute w-[240px] p-3 rounded-lg border-2 backdrop-blur-sm text-left transition-all',
        BLOCK_COLOR[block.type],
        selected ? 'ring-2 ring-brand shadow-[0_0_20px_rgba(107,143,94,0.3)]' : 'hover:ring-1 hover:ring-creme-faint/30',
      )}
      style={{ left: block.position.x, top: block.position.y }}
    >
      <div className="flex items-start gap-2">
        <GripVertical size={12} className="text-creme-faint shrink-0 mt-0.5" />
        <span className="text-[16px] leading-none shrink-0">{paletteEntry?.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{block.type}</div>
          <div className="text-[13px] font-bold text-creme leading-tight">{block.title}</div>
          <div className="text-[11px] text-creme-mute mt-0.5 leading-tight">{block.subtitle}</div>
          <div className="text-[10px] font-mono text-creme-faint mt-1.5 leading-tight line-clamp-2">{block.configSummary}</div>
        </div>
      </div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1 block">{label}</label>
      {children}
    </div>
  );
}
