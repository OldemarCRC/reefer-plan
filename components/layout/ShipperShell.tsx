'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import ShipperSidebar from './ShipperSidebar';
import styles from './ShipperShell.module.css';

const SHIPPER_SIDEBAR_KEY = 'reefer-shipper-sidebar-collapsed';

interface ShipperShellProps {
  children: React.ReactNode;
}

export default function ShipperShell({ children }: ShipperShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  // Persist desktop state; start collapsed on mobile
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      setCollapsed(true);
      return;
    }
    const stored = localStorage.getItem(SHIPPER_SIDEBAR_KEY);
    if (stored !== null) setCollapsed(stored === 'true');
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SHIPPER_SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <div className={styles.layout}>
      <ShipperSidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <main className={`${styles.main} ${collapsed ? styles['main--collapsed'] : ''}`}>
        <header className={styles.header}>
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
