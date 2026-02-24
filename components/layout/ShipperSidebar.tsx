'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import styles from './ShipperSidebar.module.css';

// --- SVG Icons ---

const icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="11" width="7" height="10" rx="1" />
    </svg>
  ),
  bookings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 4V2" />
      <path d="M17 4V2" />
      <path d="M7 14h4" />
      <path d="M7 17h2" />
    </svg>
  ),
  schedules: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 18h10" />
      <path d="M5 16V9l7-4 7 4v7" />
      <path d="M12 5v6" />
    </svg>
  ),
  request: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
};

const navItems = [
  { id: 'overview',  label: 'Overview',     href: '/shipper',           icon: 'overview'  as const },
  { id: 'bookings',  label: 'My Bookings',  href: '/shipper/bookings',  icon: 'bookings'  as const },
  { id: 'schedules', label: 'Schedules',    href: '/shipper/schedules', icon: 'schedules' as const },
  { id: 'request',   label: 'New Request',  href: '/shipper/request',   icon: 'request'   as const },
  { id: 'account',   label: 'My Account',   href: '/account',           icon: 'account'   as const },
];

interface ShipperSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function ShipperSidebar({ collapsed, onToggle }: ShipperSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? session?.user?.email ?? '?';
  const initials = userName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  const isActive = (href: string) => {
    if (href === '/shipper') return pathname === '/shipper';
    return pathname.startsWith(href);
  };

  const handleSignOut = useCallback(() => {
    signOut({ callbackUrl: '/login' });
  }, []);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles['sidebar--collapsed'] : ''}`}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <svg viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#3B82F6" fillOpacity="0.15" />
            <path
              d="M6 18.5L8.5 14h11L22 18.5"
              stroke="#3B82F6"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 14V9.5a1 1 0 011-1h8a1 1 0 011 1V14"
              stroke="#3B82F6"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="14" y1="8.5" x2="14" y2="6" stroke="#3B82F6" strokeWidth="1.75" strokeLinecap="round" />
            <path
              d="M4 20c2 0 3-.8 4-.8s2 .8 4 .8 3-.8 4-.8 2 .8 4 .8 3-.8 4-.8"
              stroke="#06B6D4"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span className={styles.brandText}>Reefer Planner</span>
        <span className={styles.portalBadge}>Shipper</span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navSectionLabel}>Portal</div>

        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${isActive(item.href) ? styles['navItem--active'] : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.navIcon}>{icons[item.icon]}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleSignOut}
          className={styles.navItem}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left', color: 'var(--color-text-secondary)' }}
          title={collapsed ? 'Sign out' : undefined}
        >
          <span className={styles.navIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className={styles.navLabel}>Sign Out</span>
        </button>
      </nav>

      {/* User info */}
      <div className={styles.userSection}>
        <div className={styles.userAvatar}>{initials}</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{userName}</div>
          <div className={styles.userRole}>Exporter</div>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        className={styles.collapseBtn}
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className={`${styles.collapseIcon} ${collapsed ? styles['collapseIcon--rotated'] : ''}`}>
          {icons.collapse}
        </span>
        <span className={styles.collapseLabel}>Collapse</span>
      </button>
    </aside>
  );
}
