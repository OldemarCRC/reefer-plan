'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './Sidebar.module.css';
import { getPortWeather } from '@/app/actions/weather';
import { getFleetStatus } from '@/app/actions/voyage';
import { FlagIcon } from '@/lib/utils/flagIcon';
// getServicePortsForWeather is kept for future use when user auth is available
// import { getServicePortsForWeather } from '@/app/actions/service';

// --- SVG Icons (inline, no dependencies) ---

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="11" width="7" height="10" rx="1" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  vessel: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20l.6-1.2C3.7 16.6 5.9 15 8.4 15h7.2c2.5 0 4.7 1.6 5.8 3.8L22 20" />
      <path d="M4 15V8a2 2 0 012-2h12a2 2 0 012 2v7" />
      <path d="M12 6V3" />
      <path d="M8 10h8" />
    </svg>
  ),
  voyage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 18h10" />
      <path d="M5 16V9l7-4 7 4v7" />
      <path d="M12 5v6" />
    </svg>
  ),
  booking: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 4V2" />
      <path d="M17 4V2" />
      <path d="M7 14h4" />
      <path d="M7 17h2" />
    </svg>
  ),
  stowagePlan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
};

// --- Static port list for sidebar weather widget ---
// Curated to the 6 key service ports. Dynamic DB loading caused overflow (14 ports).
// Replace with getServicePortsForWeather() once user auth filters by office/service.

const SIDEBAR_PORTS = [
  { code: 'CLVAP', label: 'Valparaíso', country: 'CL', city: 'Valparaíso' },
  { code: 'ECGYE', label: 'Guayaquil',  country: 'EC', city: 'Guayaquil'  },
  { code: 'USILG', label: 'Wilmington', country: 'US', city: 'Wilmington' },
  { code: 'COSMR', label: 'Santa Marta',country: 'CO', city: 'Santa Marta'},
  { code: 'NLVLI', label: 'Flushing',   country: 'NL', city: 'Flushing'   },
  { code: 'GBPME', label: 'Portsmouth', country: 'GB', city: 'Portsmouth' },
];

// --- Navigation items ---

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: keyof typeof icons;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',     href: '/',              icon: 'dashboard'   },
  { id: 'voyages',       label: 'Voyages',        href: '/voyages',       icon: 'voyage'      },
  { id: 'vessels',       label: 'Vessels',        href: '/vessels',       icon: 'vessel'      },
  { id: 'bookings',      label: 'Bookings',       href: '/bookings',      icon: 'booking'     },
  { id: 'stowage-plans', label: 'Stowage Plans',  href: '/stowage-plans', icon: 'stowagePlan' },
  { id: 'admin',         label: 'Admin',          href: '/admin',         icon: 'admin'       },
];

// Items visible to roles with read-only / limited access
const LIMITED_ITEMS = new Set(['dashboard', 'voyages', 'stowage-plans']);

function getVisibleItems(role: string | undefined): NavItem[] {
  if (role === 'ADMIN') return navItems;
  if (role === 'SHIPPING_PLANNER') return navItems.filter(i => i.id !== 'admin');
  // STEVEDORE, CHECKER, VIEWER — and any unrecognized role (safe default)
  return navItems.filter(i => LIMITED_ITEMS.has(i.id));
}


function tempClass(temp: number): string {
  if (temp >= 35) return styles.tempHot;
  if (temp <= -10) return styles.tempCold;
  return '';
}

// --- Component ---

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
}

interface PortTemp {
  code: string;
  label: string;
  country: string;
  temp: number | null;
}

interface FleetStatus {
  inTransit: number;
  planned: number;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const visibleNavItems = getVisibleItems(role);

  const [portTemps, setPortTemps] = useState<PortTemp[]>([]);
  const [fleet, setFleet] = useState<FleetStatus | null>(null);

  useEffect(() => {
    // Fetch weather for each static port in parallel
    Promise.all(
      SIDEBAR_PORTS.map(async (p) => {
        const temp = await getPortWeather(p.city, p.country);
        return { code: p.code, label: p.label, country: p.country, temp };
      })
    ).then(setPortTemps);

    // Fetch fleet status
    getFleetStatus().then(setFleet);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const totalActive = fleet ? fleet.inTransit + fleet.planned : 0;

  return (
    <aside className={`${styles.sidebar} app-sidebar ${collapsed ? styles['sidebar--collapsed'] : ''} ${mobileOpen ? styles['sidebar--mobileOpen'] : ''}`}>
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
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navSectionLabel}>Planning</div>

        {visibleNavItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${isActive(item.href) ? styles['navItem--active'] : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.navIcon}>{icons[item.icon]}</span>
            <span className={styles.navLabel}>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className={styles.navBadge}>{item.badge}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* ── Bottom widgets ── */}
      <div className={styles.widgets}>

        {/* Fleet Status */}
        <div className={styles.widget}>
          {/* Collapsed tooltip icon — only visible when sidebar is collapsed */}
          <span
            className={styles.widgetCollapsedHint}
            title={fleet
              ? `Fleet: ${fleet.inTransit} in transit · ${fleet.planned} planned`
              : 'Fleet status loading…'}
          >⛴</span>
          {/* Full content — hidden when collapsed */}
          <div className={styles.widgetLabel}>Fleet Status</div>
          <div className={styles.fleetRow}>
            <span className={styles.fleetIcon}>⛴</span>
            <span className={styles.fleetText}>In Transit</span>
            <span className={styles.fleetCount}>{fleet?.inTransit ?? '—'}</span>
          </div>
          {fleet?.planned ? (
            <div className={styles.fleetRow}>
              <span className={styles.fleetIcon}>📋</span>
              <span className={styles.fleetText}>Planned</span>
              <span className={styles.fleetCount}>{fleet.planned}</span>
            </div>
          ) : null}
        </div>

        <div className={styles.widgetDivider} />

        {/* Port Temperatures */}
        <div className={styles.widget}>
          {/* Collapsed tooltip icon */}
          <span
            className={styles.widgetCollapsedHint}
            title={portTemps.length > 0
              ? portTemps.map(p => `[${p.country}] ${p.label} ${p.temp !== null ? `${p.temp > 0 ? '+' : ''}${p.temp}°` : '—'}`).join(' · ')
              : 'Port temperatures loading…'}
          >🌡</span>
          {/* Full content — hidden when collapsed */}
          <div className={styles.widgetLabel}>Port Temps</div>
          {portTemps.length === 0 ? (
            <div className={styles.tempLoading}>Loading…</div>
          ) : (
            portTemps.map((p) => (
              <div key={p.code} className={styles.tempRow}>
                <span className={styles.tempFlag}><FlagIcon code={p.country} /></span>
                <span className={styles.tempPort}>{p.label}</span>
                <span className={`${styles.tempValue} ${p.temp !== null ? tempClass(p.temp) : ''}`}>
                  {p.temp !== null ? `${p.temp > 0 ? '+' : ''}${p.temp}°` : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button className={styles.collapseBtn} onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <span className={`${styles.collapseIcon} ${collapsed ? styles['collapseIcon--rotated'] : ''}`}>
          {icons.collapse}
        </span>
        <span className={styles.collapseLabel}>Collapse</span>
      </button>
    </aside>
  );
}
