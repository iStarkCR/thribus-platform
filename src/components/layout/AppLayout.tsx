import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[244px] flex-1 flex flex-col min-h-screen">
        <div className="flex-1 p-6">{children}</div>
      </main>
    </div>
  );
}
