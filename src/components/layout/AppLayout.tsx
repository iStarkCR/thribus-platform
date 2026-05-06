import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NewAgentModal } from '@/components/agents/NewAgentModal';
import { TestAgentModal } from '@/components/agents/TestAgentModal';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [showTestAgent, setShowTestAgent] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[244px] flex-1 flex flex-col min-h-screen">
        <Header
          onNewAgent={() => setShowNewAgent(true)}
          onTestAgent={() => setShowTestAgent(true)}
        />
        <div className="flex-1 p-6">{children}</div>
      </main>

      {showNewAgent && <NewAgentModal onClose={() => setShowNewAgent(false)} />}
      {showTestAgent && <TestAgentModal onClose={() => setShowTestAgent(false)} />}
    </div>
  );
}
