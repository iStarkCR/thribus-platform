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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-200 ${collapsed ? 'ml-[64px]' : 'ml-[244px]'}`}>
        <div className="flex-1 p-6">{children}</div>
      </main>
    </div>
  );
}
