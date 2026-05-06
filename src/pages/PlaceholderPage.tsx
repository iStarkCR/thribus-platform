import {
  MessageSquare, BarChart3, Terminal, Settings, Building2,
} from 'lucide-react';

const ICONS: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
  chart: BarChart3,
  terminal: Terminal,
  settings: Settings,
  building: Building2,
};

interface Props {
  title: string;
  description: string;
  icon: string;
}

export function PlaceholderPage({ title, description, icon }: Props) {
  const Icon = ICONS[icon] || Settings;

  return (
    <>
      <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-4">
        <Icon size={16} className="text-creme-mute" /> {title}
      </div>
      <div className="bg-surface-2 border border-default rounded-[10px] px-12 py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-3 border border-default flex items-center justify-center mx-auto mb-4">
          <Icon size={22} className="text-creme-faint" />
        </div>
        <p className="text-sm text-creme-mute">{description}</p>
      </div>
    </>
  );
}
