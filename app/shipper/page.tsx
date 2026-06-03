// ============================================================================
// SHIPPER PORTAL — Dashboard
// ============================================================================

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getShipperDashboard, getPendingRequestsForShipper } from '@/app/actions/shipper';
import KpiCards from './KpiCards';
import UpcomingVoyageStrip from './UpcomingVoyageStrip';
import styles from './shipper.module.css';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PARTIAL:   { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)' },
  STANDBY:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  REJECTED:  { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

export default async function ShipperDashboardPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;
  const shipperId   = (session?.user as any)?.shipperId   as string | null;

  if (!shipperCode && !shipperId) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Dashboard</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account is not linked to a shipper. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const result = await getShipperDashboard(shipperCode ?? '', shipperId ?? undefined);
  if (!result.success || !result.data) {
    return <div className={styles.emptyState}><p>Failed to load dashboard.</p></div>;
  }

  const { summary, upcomingVoyages, recentBookings } = result.data;

  const pendingResult = await getPendingRequestsForShipper();
  const pendingRequests = pendingResult.success ? pendingResult.data ?? [] : [];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Overview</h1>
        <p className={styles.pageSubtitle}>Welcome back — here&apos;s your current booking summary.</p>
      </div>

      <KpiCards
        activeBookings={summary.activeBookings}
        confirmedPallets={summary.confirmedPallets}
        pendingCount={summary.pendingCount}
        pendingPallets={summary.pendingPallets}
        standbyCount={summary.standbyCount}
        standbyPallets={summary.standbyPallets}
        pendingRequestsCount={pendingRequests.length}
        pendingRequestsHasEstimate={pendingRequests.filter(r => r.forecastStatus === 'HAS_ESTIMATE').length}
      />

      {/* Upcoming Voyages */}
      {upcomingVoyages.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Upcoming Voyages</h2>
            <Link href="/shipper/schedules" className={styles.sectionLink}>View all schedules →</Link>
          </div>
          <UpcomingVoyageStrip voyages={upcomingVoyages} />
        </div>
      )}

      {/* Recent Bookings */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Bookings</h2>
          <Link href="/shipper/bookings" className={styles.sectionLink}>View all →</Link>
        </div>

        {recentBookings.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📦</div>
            <div className={styles.emptyStateTitle}>No bookings yet</div>
            <div className={styles.emptyStateDesc}>
              <Link href="/shipper/request" style={{ color: 'var(--color-blue-light)' }}>Submit a booking request</Link> to get started.
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.recentBookingsTable}`}>
              <thead>
                <tr>
                  <th>Booking #</th>
                  <th>Voyage</th>
                  <th>Vessel</th>
                  <th>Week</th>
                  <th>Cargo</th>
                  <th>Consignee</th>
                  <th>Req.</th>
                  <th>Conf.</th>
                  <th>Route</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b: any) => {
                  const s = STATUS_COLORS[b.status] ?? STATUS_COLORS.CANCELLED;
                  return (
                    <tr key={b._id}>
                      <td data-label="Booking #">
                        <Link href={`/shipper/bookings/${b._id}`} className={styles.tableLink}>
                          {b.bookingNumber}
                        </Link>
                      </td>
                      <td data-label="Voyage" className={styles.mono}>{b.voyageNumber || '—'}</td>
                      <td data-label="Vessel">{b.vesselName || '—'}</td>
                      <td data-label="Week" className={styles.mono}>
                        {b.voyageNumber ? `Wk ${b.voyageNumber.slice(-2)}` : '—'}
                      </td>
                      <td data-label="Cargo">{b.cargoType.replace(/_/g, ' ')}</td>
                      <td data-label="Consignee">{b.consignee?.name || '—'}</td>
                      <td data-label="Req." className={styles.mono}>{b.requestedQuantity}</td>
                      <td data-label="Conf." className={styles.mono}>{b.confirmedQuantity || '—'}</td>
                      <td data-label="Route">
                        <div className={styles.portRoute}>
                          <span>{b.pol?.portCode ?? '—'}</span>
                          <span className={styles.portArrow}>→</span>
                          <span>{b.pod?.portCode ?? '—'}</span>
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={styles.badge} style={{ background: s.bg, color: s.color }}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
