'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
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
  if (segment.length === 24 && /^[a-f0-9]+$/.test(segment)) {
    return segment.slice(0, 8) + '…';
  }
  if (segment.includes('-')) {
    return segment.toUpperCase();
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

// --- Component ---

interface HeaderProps {
  sidebarCollapsed: boolean;
  onMobileMenuToggle: () => void;
  activeVessel?: string;
  activeVoyage?: string;
  userName?: string;
  userRole?: string;
}

export default function Header({
  sidebarCollapsed,
  onMobileMenuToggle,
  activeVessel,
  activeVoyage,
  userName = '?',
  userRole,
}: HeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleLabel: Record<string, string> = {
    ADMIN: 'Administrator',
    SHIPPING_PLANNER: 'Shipping Planner',
    STEVEDORE: 'Stevedore',
    CHECKER: 'Checker',
    EXPORTER: 'Exporter',
    VIEWER: 'Viewer',
  };

  return (
    <header className={`${styles.header} ${sidebarCollapsed ? styles['header--collapsed'] : ''}`}>
      {/* Mobile hamburger — hidden on desktop via CSS */}
      <button className={styles.menuToggle} onClick={onMobileMenuToggle} aria-label="Toggle navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

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

        {/* User avatar + dropdown */}
        <div className={styles.userMenu} ref={menuRef}>
          <button
            className={styles.userButton}
            onClick={() => setMenuOpen((o) => !o)}
            title={userName}
            aria-expanded={menuOpen}
          >
            {initials}
          </button>

          {menuOpen && (
            <div className={styles.userDropdown}>
              <div className={styles.userInfo}>
                <span className={styles.userInfoName}>{userName}</span>
                {userRole && (
                  <span className={styles.userInfoRole}>{roleLabel[userRole] || userRole}</span>
                )}
              </div>
              <div className={styles.userDropdownDivider} />
              <Link href="/account" className={styles.accountLink} onClick={() => setMenuOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Change Password
              </Link>
              <div className={styles.userDropdownDivider} />
              <form action={logoutAction}>
                <button type="submit" className={styles.logoutBtn}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
