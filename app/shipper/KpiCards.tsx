'use client';

import { useRouter } from 'next/navigation';
import styles from './shipper.module.css';

interface KpiCardsProps {
  activeBookings: number;
  confirmedPallets: number;
  pendingCount: number;
  pendingPallets: number;
  standbyCount: number;
  standbyPallets: number;
  pendingRequestsCount: number;
  pendingRequestsMissing: number;
  pendingRequestsDefault: number;
}

export default function KpiCards({
  activeBookings,
  confirmedPallets,
  pendingCount,
  pendingPallets,
  standbyCount,
  standbyPallets,
  pendingRequestsCount,
  pendingRequestsMissing,
  pendingRequestsDefault,
}: KpiCardsProps) {
  const router = useRouter();

  function nav(href: string) {
    return {
      onClick: () => router.push(href),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') router.push(href);
      },
      role: 'button' as const,
      tabIndex: 0,
    };
  }

  return (
    <div className={styles.summaryGrid}>
      <div className={styles.kpiCard} {...nav('/shipper/bookings')}>
        <div className={styles.kpiLabel}>Active Bookings</div>
        <div className={`${styles.kpiValue} ${styles['kpiValue--blue']}`}>
          {activeBookings}
        </div>
        <div className={styles.kpiSub}>Pending, confirmed, standby</div>
      </div>

      <div className={styles.kpiCard} {...nav('/shipper/bookings?status=CONFIRMED')}>
        <div className={styles.kpiLabel}>Confirmed Pallets</div>
        <div className={`${styles.kpiValue} ${styles['kpiValue--green']}`}>
          {confirmedPallets}
        </div>
        <div className={styles.kpiSub}>Across confirmed bookings</div>
      </div>

      <div className={styles.kpiCard} {...nav('/shipper/bookings?status=PENDING')}>
        <div className={styles.kpiLabel}>Awaiting Approval</div>
        <div className={`${styles.kpiValue} ${styles['kpiValue--yellow']}`}>
          {pendingPallets}
        </div>
        <div className={styles.kpiSub}>
          Across {pendingCount} booking{pendingCount !== 1 ? 's' : ''} pending confirmation
        </div>
      </div>

      <div className={styles.kpiCard} {...nav('/shipper/bookings?status=STANDBY')}>
        <div className={styles.kpiLabel}>On Standby</div>
        <div className={`${styles.kpiValue} ${styles['kpiValue--muted']}`}>
          {standbyPallets}
        </div>
        <div className={styles.kpiSub}>
          Pallets on Standby · {standbyCount} booking{standbyCount !== 1 ? 's' : ''}
        </div>
      </div>

      <div className={styles.kpiCard} {...nav('/shipper/forecasts?pending=1')}>
        <div className={styles.kpiLabel}>Pending Requests</div>
        <div className={`${styles.kpiValue} ${
          pendingRequestsCount > 0 ? styles.kpiWarning : styles.kpiMuted
        }`}>
          {pendingRequestsCount}
        </div>
        <div className={styles.kpiSub}>
          {pendingRequestsCount === 0
            ? 'All forecasts submitted'
            : `${pendingRequestsMissing} missing · ${pendingRequestsDefault} contract default`
          }
        </div>
      </div>
    </div>
  );
}
