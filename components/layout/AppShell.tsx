'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from './Sidebar';
import Header from './Header';

const SIDEBAR_KEY = 'reefer-sidebar-collapsed';

interface AppShellProps {
  children: React.ReactNode;
  activeVessel?: string;
  activeVoyage?: string;
}

export default function AppShell({ children, activeVessel, activeVoyage }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Transitions are disabled until the initial persisted state has been painted.
  // This prevents the sidebar from visibly animating open→closed on every page load.
  const [transitionsReady, setTransitionsReady] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  // On mount: detect mobile breakpoint and restore persisted desktop state
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');

    const update = (mobile: boolean) => {
      setIsMobile(mobile);
      if (!mobile) {
        const stored = localStorage.getItem(SIDEBAR_KEY);
        if (stored !== null) setCollapsed(stored === 'true');
      }
    };

    update(mq.matches);

    const handler = (e: MediaQueryListEvent) => update(e.matches);
    mq.addEventListener('change', handler);

    // Wait for two animation frames so the browser has painted the corrected
    // state before we re-enable CSS transitions. This eliminates the
    // expand→collapse flicker caused by the hydration gap.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionsReady(true));
    });

    return () => {
      cancelAnimationFrame(raf1);
      mq.removeEventListener('change', handler);
    };
  }, []);

  // Close mobile sidebar whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // On mobile the sidebar is always full-width when visible — never show the collapsed icon-only mode
  const effectiveCollapsed = isMobile ? false : collapsed;

  return (
    <div className={`app-layout${transitionsReady ? ' transitions-ready' : ''}`}>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <Sidebar
        collapsed={effectiveCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
      />
      <main className={`app-main ${effectiveCollapsed ? 'app-main--collapsed' : ''}`}>
        <Header
          sidebarCollapsed={effectiveCollapsed}
          onMobileMenuToggle={toggleMobile}
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
