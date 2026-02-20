'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppShellProps {
  children: React.ReactNode;
  activeVessel?: string;
  activeVoyage?: string;
}

export default function AppShell({ children, activeVessel, activeVoyage }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { data: session } = useSession();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <main className={`app-main ${sidebarCollapsed ? 'app-main--collapsed' : ''}`}>
        <Header
          sidebarCollapsed={sidebarCollapsed}
          activeVessel={activeVessel}
          activeVoyage={activeVoyage}
          userName={session?.user?.name || session?.user?.email || '?'}
          userRole={(session?.user as any)?.role}
        />
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}
