import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/hooks/useAppStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);

  // Fecha o drawer da nav ao trocar de rota (mobile).
  useEffect(() => { setMobileNavOpen(false); }, [pathname, setMobileNavOpen]);

  // Recolhe ao ENTRAR no chat e expande ao SAIR — só na transição, sem brigar
  // com o toggle manual. Na 1ª carga respeita a preferência salva (localStorage).
  const wasChat = useRef<boolean | null>(null);
  useEffect(() => {
    const isChat = pathname.startsWith('/talk');
    if (wasChat.current === null) { wasChat.current = isChat; return; }
    if (isChat !== wasChat.current) {
      setSidebarCollapsed(isChat);
      wasChat.current = isChat;
    }
  }, [pathname, setSidebarCollapsed]);

  // No chat (/talk) o shell é PINADO ao viewport VISÍVEL com `fixed inset-0` —
  // não `h-screen`. Em painel/webview (app Bukowiski) `100vh` pode ser MAIOR que
  // a área visível, jogando o composer abaixo da dobra (e, depois de rolar, o
  // header pra fora do topo). `fixed inset-0` casa exatamente com a janela: header
  // e composer sempre visíveis, zero scroll de documento. Demais páginas seguem
  // com padding + min-h-screen (rolam quando o conteúdo é longo).
  const isChat = pathname.startsWith('/talk');
  return (
    <div className={isChat ? 'fixed inset-0 flex overflow-hidden' : 'flex min-h-screen'}>
      <Sidebar />
      {/* Backdrop do drawer da nav (só mobile) */}
      {mobileNavOpen && (
        <div onClick={() => setMobileNavOpen(false)} className="fixed inset-0 bg-black/55 z-[55] md:hidden" />
      )}
      {/* Em mobile o conteúdo ocupa a tela toda (ml-0); margem só vale no desktop. */}
      <main className={`flex-1 flex flex-col transition-[margin] duration-200 ml-0 ${collapsed ? 'md:ml-[64px]' : 'md:ml-[244px]'} ${isChat ? 'h-full min-h-0 overflow-hidden' : 'min-h-screen'}`}>
        {/* Páginas não-chat: hamburger flutuante pra abrir a nav (o chat tem o seu no header). */}
        {!isChat && (
          <button onClick={() => setMobileNavOpen(true)} className="md:hidden fixed top-3 left-3 z-[45] w-9 h-9 rounded-lg bg-surface-2/90 border border-default text-creme-mute hover:text-creme backdrop-blur flex items-center justify-center shadow-lg" title="Menu">
            <Menu size={18} />
          </button>
        )}
        {/* Páginas do sistema (não-chat) ganham um zoom leve pra ficar legíveis como o
            chat — o chat já usa tipografia grande, então fica de fora.
            max-md:pt-16 abre espaço pro hamburger flutuante não cobrir o título em mobile. */}
        <div className={isChat ? 'flex-1 min-h-0 flex flex-col' : 'flex-1 p-6 max-md:pt-16 [zoom:1.1]'}>{children}</div>
      </main>
    </div>
  );
}
