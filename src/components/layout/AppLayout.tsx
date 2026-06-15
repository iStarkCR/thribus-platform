import { useEffect, type ReactNode } from 'react';
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

  // Padrão: sidebar recolhida no chat, expandida nas outras telas.
  useEffect(() => {
    setSidebarCollapsed(pathname.startsWith('/talk'));
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
