'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import ShipperSidebar from './ShipperSidebar';
import styles from './ShipperShell.module.css';

interface ShipperShellProps {
  children: React.ReactNode;
}

export default function ShipperShell({ children }: ShipperShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => !prev);
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
