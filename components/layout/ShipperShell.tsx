'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import ShipperSidebar from './ShipperSidebar';
import styles from './ShipperShell.module.css';

const SHIPPER_SIDEBAR_KEY = 'reefer-shipper-sidebar-collapsed';

interface ShipperShellProps {
  children: React.ReactNode;
  shipperName?: string;
}

export default function ShipperShell({ children, shipperName }: ShipperShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');

    const syncState = (mobile: boolean) => {
      setIsMobile(mobile);
      if (!mobile) {
        const stored = localStorage.getItem(SHIPPER_SIDEBAR_KEY);
        if (stored !== null) setCollapsed(stored === 'true');
      }
    };

    syncState(mq.matches);

    const handler = (e: MediaQueryListEvent) => syncState(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen(prev => !prev);
    } else {
      setCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem(SHIPPER_SIDEBAR_KEY, String(next));
        return next;
      });
    }
  }, [isMobile]);

  // On mobile the sidebar is always full-width overlay — never icon-only
  const effectiveCollapsed = isMobile ? false : collapsed;

  return (
    <div className={styles.layout}>
      {mobileOpen && (
        <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />
      )}
      <ShipperSidebar
        collapsed={effectiveCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        shipperName={shipperName}
      />

      <main className={`${styles.main} ${effectiveCollapsed ? styles['main--collapsed'] : ''}`}>
        <header className={styles.header}>
          <button
            className={styles.menuToggle}
            onClick={() => setMobileOpen(prev => !prev)}
            aria-label="Toggle menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className={styles.headerTitle}>Shipper Portal</span>
          {shipperCode && (
            <span className={styles.headerShipperCode}>{shipperCode}</span>
          )}
        </header>
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
