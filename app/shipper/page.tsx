// ============================================================================
// SHIPPER PORTAL — Dashboard
// ============================================================================

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getShipperDashboard } from '@/app/actions/shipper';
import styles from './shipper.module.css';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PARTIAL:   { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)' },
  STANDBY:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  REJECTED:  { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function countryFlag(country: string) {
  if (!country || country.length !== 2) return '';
  return country.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

export default async function ShipperDashboardPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  if (!shipperCode) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Dashboard</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account has not been linked to a shipper code yet.
            Please contact your shipping coordinator to complete account setup.
          </p>
        </div>
      </div>
    );
  }

  const result = await getShipperDashboard(shipperCode);
  if (!result.success || !result.data) {
    return <div className={styles.emptyState}><p>Failed to load dashboard.</p></div>;
  }

  const { summary, upcomingVoyages, recentBookings } = result.data;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Overview</h1>
        <p className={styles.pageSubtitle}>Welcome back — here&apos;s your current booking summary.</p>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryCardLabel}>Active Bookings</div>
          <div className={`${styles.summaryCardValue} ${styles['summaryCardValue--blue']}`}>
            {summary.activeBookings}
          </div>
          <div className={styles.summaryCardDesc}>Pending, confirmed, standby</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryCardLabel}>Confirmed Pallets</div>
          <div className={`${styles.summaryCardValue} ${styles['summaryCardValue--green']}`}>
            {summary.confirmedPallets}
          </div>
          <div className={styles.summaryCardDesc}>Across confirmed bookings</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryCardLabel}>Awaiting Approval</div>
          <div className={`${styles.summaryCardValue} ${styles['summaryCardValue--yellow']}`}>
            {summary.pendingCount}
          </div>
          <div className={styles.summaryCardDesc}>Pending confirmation</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryCardLabel}>On Standby</div>
          <div className={`${styles.summaryCardValue} ${styles['summaryCardValue--muted']}`}>
            {summary.standbyCount}
          </div>
          <div className={styles.summaryCardDesc}>Standby allocation</div>
        </div>
      </div>

      {/* Upcoming Voyages */}
      {upcomingVoyages.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Upcoming Voyages</h2>
            <Link href="/shipper/schedules" className={styles.sectionLink}>View all schedules →</Link>
          </div>
          <div className={styles.voyageStrip}>
            {upcomingVoyages.map((v: any) => {
              const loadPorts = v.portCalls.filter((pc: any) => pc.operations?.includes('LOAD'));
              const dischPorts = v.portCalls.filter((pc: any) => pc.operations?.includes('DISCHARGE'));
              return (
                <div key={v._id} className={styles.voyageCard}>
                  <div className={styles.voyageCardNum}>{v.voyageNumber}</div>
                  <div className={styles.voyageCardVessel}>{v.vesselName}</div>
                  <div className={styles.voyageCardDep}>
                    Dep. {fmtDate(v.departureDate)}
                  </div>
                  <div className={styles.portChain}>
                    {loadPorts.map((pc: any, i: number) => (
                      <span key={i} className={`${styles.portDot} ${styles['portDot--load']}`}>
                        {countryFlag(pc.country)} {pc.portCode}
                        {i < loadPorts.length - 1 && <span className={styles.portDotSep} />}
                      </span>
                    ))}
                    {dischPorts.length > 0 && <span className={`${styles.portDot} ${styles.portArrow}`}> → </span>}
                    {dischPorts.map((pc: any, i: number) => (
                      <span key={i} className={`${styles.portDot} ${styles['portDot--discharge']}`}>
                        {countryFlag(pc.country)} {pc.portCode}
                        {i < dischPorts.length - 1 && <span className={styles.portDotSep} />}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Booking #</th>
                  <th>Voyage</th>
                  <th>Cargo</th>
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
                      <td>
                        <Link href={`/shipper/bookings/${b._id}`} className={styles.tableLink}>
                          {b.bookingNumber}
                        </Link>
                      </td>
                      <td className={styles.mono}>{b.voyageNumber || '—'}</td>
                      <td>{b.cargoType.replace(/_/g, ' ')}</td>
                      <td className={styles.mono}>{b.requestedQuantity}</td>
                      <td className={styles.mono}>{b.confirmedQuantity || '—'}</td>
                      <td>
                        <div className={styles.portRoute}>
                          <span>{b.pol?.portCode ?? '—'}</span>
                          <span className={styles.portArrow}>→</span>
                          <span>{b.pod?.portCode ?? '—'}</span>
                        </div>
                      </td>
                      <td>
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
