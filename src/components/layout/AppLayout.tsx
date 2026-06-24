import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/hooks/useAppStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);

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

  // No chat (/talk), a coluna ocupa exatamente a viewport (altura travada via
  // flex, sem padding) pra a tela inicial NÃO rolar e nada ser cortado. Demais
  // páginas seguem com padding + min-h-screen (rolam quando o conteúdo é longo).
  const isChat = pathname.startsWith('/talk');
  return (
    <div className={`flex ${isChat ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <Sidebar />
      <main className={`flex-1 flex flex-col transition-[margin] duration-200 ${collapsed ? 'ml-[64px]' : 'ml-[244px]'} ${isChat ? 'h-screen min-h-0 overflow-hidden' : 'min-h-screen'}`}>
        <div className={isChat ? 'flex-1 min-h-0 flex flex-col' : 'flex-1 p-6'}>{children}</div>
      </main>
    </div>
  );
}
