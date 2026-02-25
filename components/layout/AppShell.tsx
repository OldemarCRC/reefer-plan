'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from './Sidebar';
import Header from './Header';

const SIDEBAR_KEY = 'reefer-sidebar-collapsed';
const HTML_CLASS  = 'sidebar-collapsed';

interface AppShellProps {
  children: React.ReactNode;
  activeVessel?: string;
  activeVoyage?: string;
}

export default function AppShell({ children, activeVessel, activeVoyage }: AppShellProps) {
  // Default false for SSR; the blocking <script> in layout.tsx sets the correct
  // visual state before React loads, so there is no visible expand→collapse jump.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Transitions are off until the initial state has been painted; this prevents
  // any residual animation during the hydration gap.
  const [transitionsReady, setTransitionsReady] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  // On mount: sync React state from the <html> class that was set by the
  // blocking script (already visually correct). Keep everything in sync.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');

    const syncState = (mobile: boolean) => {
      setIsMobile(mobile);
      if (mobile) {
        // Mobile never uses the collapsed class — remove in case of resize
        document.documentElement.classList.remove(HTML_CLASS);
        setCollapsed(false);
      } else {
        // Read the state that the blocking script already applied
        const isCollapsed = document.documentElement.classList.contains(HTML_CLASS);
        setCollapsed(isCollapsed);
      }
    };

    syncState(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      const nowMobile = e.matches;
      if (!nowMobile) {
        // Switching to desktop: restore from localStorage
        const stored = localStorage.getItem(SIDEBAR_KEY) === 'true';
        if (stored) document.documentElement.classList.add(HTML_CLASS);
        else         document.documentElement.classList.remove(HTML_CLASS);
      }
      syncState(nowMobile);
    };
    mq.addEventListener('change', handler);

    // Enable transitions only after the corrected state has been painted
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionsReady(true));
    });

    return () => {
      cancelAnimationFrame(raf1);
      mq.removeEventListener('change', handler);
    };
  }, []);

  // Close mobile sidebar on every route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      // Keep the <html> class in sync so CSS always matches React state
      if (next) document.documentElement.classList.add(HTML_CLASS);
      else       document.documentElement.classList.remove(HTML_CLASS);
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // On mobile the sidebar is always full-width — never icon-only collapsed mode
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
