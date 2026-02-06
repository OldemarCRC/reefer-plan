'use client';

import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppShellProps {
  children: React.ReactNode;
  activeVessel?: string;
  activeVoyage?: string;
}

export default function AppShell({ children, activeVessel, activeVoyage }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        />
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}
