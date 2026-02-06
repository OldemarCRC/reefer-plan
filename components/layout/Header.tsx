'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';

// --- Breadcrumb generation from pathname ---

interface BreadcrumbItem {
  label: string;
  href: string;
}

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  voyages: 'Voyages',
  vessels: 'Vessels',
  bookings: 'Bookings',
  'stowage-plans': 'Stowage Plans',
};

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return [{ label: 'Dashboard', href: '/' }];
  }

  const crumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];

  let path = '';
  for (const segment of segments) {
    path += `/${segment}`;
    const label = routeLabels[segment] || formatSegment(segment);
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

function formatSegment(segment: string): string {
  // Handle IDs (MongoDB ObjectIds or custom IDs)
  if (segment.length === 24 && /^[a-f0-9]+$/.test(segment)) {
    return segment.slice(0, 8) + '…';
  }
  // Handle voyage/booking numbers
  if (segment.includes('-')) {
    return segment.toUpperCase();
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

// --- Component ---

interface HeaderProps {
  sidebarCollapsed: boolean;
  activeVessel?: string;
  activeVoyage?: string;
  userName?: string;
}

export default function Header({
  sidebarCollapsed,
  activeVessel,
  activeVoyage,
  userName = 'SP',
}: HeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <header className={`${styles.header} ${sidebarCollapsed ? styles['header--collapsed'] : ''}`}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {i > 0 && <span className={styles.breadcrumbSeparator}>/</span>}
              {isLast ? (
                <span className={`${styles.breadcrumbItem} ${styles['breadcrumbItem--current']}`}>
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className={styles.breadcrumbItem}>
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right section */}
      <div className={styles.headerRight}>
        {/* Active vessel/voyage context */}
        <div className={styles.context}>
          {activeVessel && (
            <div className={styles.contextItem}>
              <span className={styles.contextIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 20l.6-1.2C3.7 16.6 5.9 15 8.4 15h7.2c2.5 0 4.7 1.6 5.8 3.8L22 20" />
                  <path d="M4 15V8a2 2 0 012-2h12a2 2 0 012 2v7" />
                </svg>
              </span>
              <span className={styles.contextLabel}>Vessel</span>
              <span className={styles.contextValue}>{activeVessel}</span>
            </div>
          )}
          {activeVoyage && (
            <div className={styles.contextItem}>
              <span className={styles.contextIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="18" r="2" />
                  <circle cx="19" cy="18" r="2" />
                  <path d="M7 18h10" />
                  <path d="M5 16V9l7-4 7 4v7" />
                </svg>
              </span>
              <span className={styles.contextLabel}>Voyage</span>
              <span className={styles.contextValue}>{activeVoyage}</span>
            </div>
          )}
        </div>

        {/* User */}
        <button className={styles.userButton} title={`User: ${userName}`}>
          {userName.slice(0, 2).toUpperCase()}
        </button>
      </div>
    </header>
  );
}
