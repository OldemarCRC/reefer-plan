import AppShell from '@/components/layout/AppShell';
import { getVoyages } from '@/app/actions/voyage';
import { getStowagePlans } from '@/app/actions/stowage-plan';
import { getBookings } from '@/app/actions/booking';
import { ClickablePlanRow } from '@/components/dashboard/ClickablePlanRow';
import styles from './page.module.css';
import type { CargoType } from '@/types/models';

// --- Status styling map ---

const statusStyles: Record<string, { bg: string; color: string }> = {
  IN_PROGRESS: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PLANNED: { bg: 'var(--color-blue-muted)', color: 'var(--color-blue-light)' },
  ESTIMATED: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  DRAFT: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  READY_FOR_CAPTAIN: { bg: 'var(--color-cyan-muted)', color: 'var(--color-cyan)' },
  EMAIL_SENT: { bg: 'var(--color-blue-muted)', color: 'var(--color-blue-light)' },
  PENDING: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  PARTIAL: { bg: 'var(--color-yellow-muted)', color: 'var(--color-yellow)' },
  STANDBY: { bg: 'var(--color-info-muted)', color: 'var(--color-info)' },
  REJECTED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  const label = status.replace(/_/g, ' ');
  return (
    <span
      className={styles.statusBadge}
      style={{ background: style.bg, color: style.color }}
    >
      {label}
    </span>
  );
}

function UtilizationBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const barColor =
    pct >= 90 ? 'var(--color-danger)' :
    pct >= 70 ? 'var(--color-warning)' :
    'var(--color-cyan)';

  return (
    <div className={styles.utilBar}>
      <div className={styles.utilTrack}>
        <div
          className={styles.utilFill}
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span className={styles.utilLabel}>{pct}%</span>
    </div>
  );
}

// --- Page ---

export default async function DashboardPage() {
  // Fetch data from database
  const voyagesResult = await getVoyages();
  const plansResult = await getStowagePlans();
  const bookingsResult = await getBookings();

  const voyages = voyagesResult.success ? voyagesResult.data : [];
  const plans = plansResult.success ? plansResult.data : [];
  const bookings = bookingsResult.success ? bookingsResult.data : [];

  // Calculate dashboard stats
  const activeVoyages = voyages.filter((v: any) =>
    v.status === 'IN_PROGRESS' || v.status === 'PLANNED' || v.status === 'CONFIRMED'
  ).length;

  const pendingBookingsCount = bookings.filter((b: any) =>
    b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL'
  ).length;

  const plansInDraft = plans.filter((p: any) => p.status === 'DRAFT').length;

  const awaitingCaptain = plans.filter((p: any) =>
    p.status === 'READY_FOR_CAPTAIN' || p.status === 'EMAIL_SENT'
  ).length;

  // Transform data for display
  const recentVoyages = voyages.slice(0, 5).map((v: any) => ({
    _id: v._id,
    voyageNumber: v.voyageNumber,
    status: v.status || 'PLANNED',
    vesselName: v.vesselName,
    serviceCode: v.serviceId?.serviceCode || 'N/A',
    palletsBooked: 0, // TODO: calculate from bookings
    palletsCapacity: 1800, // TODO: fetch from vessel
  }));

  const recentPlans = plans.slice(0, 5).map((p: any) => ({
    _id: p._id,
    planNumber: p.planNumber || `PLAN-${p._id.toString().slice(-6)}`,
    voyageNumber: p.voyageId?.voyageNumber || 'N/A',
    status: p.status || 'DRAFT',
    palletsAssigned: p.cargoPositions?.length || 0,
    palletsTotal: 1800, // TODO: fetch from vessel capacity
    overstowViolations: p.validation?.overstowViolations?.length || 0,
    temperatureConflicts: p.validation?.temperatureConflicts?.length || 0,
  }));

  const pendingBookings = bookings
    .filter((b: any) => b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL')
    .slice(0, 10)
    .map((b: any) => ({
      _id: b._id,
      bookingNumber: b.bookingNumber,
      voyageNumber: b.voyageId?.voyageNumber || 'N/A',
      clientName: b.clientName || b.client?.name || 'Unknown',
      cargoType: b.cargoType || 'OTHER_CHILLED',
      requestedQuantity: b.requestedQuantity || 0,
      polCode: b.polCode || b.pol?.portCode || 'N/A',
      podCode: b.podCode || b.pod?.portCode || 'N/A',
      status: b.status,
    }));

  const dashboardStats = {
    activeVoyages,
    pendingBookings: pendingBookingsCount,
    plansInDraft,
    awaitingCaptain,
  };

  return (
    <AppShell>
      <div className={styles.dashboard}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>Stowage planning overview</p>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          <StatCard label="Active Voyages" value={dashboardStats.activeVoyages} accent="blue" />
          <StatCard label="Pending Bookings" value={dashboardStats.pendingBookings} accent="yellow" />
          <StatCard label="Plans in Draft" value={dashboardStats.plansInDraft} accent="cyan" />
          <StatCard label="Awaiting Captain" value={dashboardStats.awaitingCaptain} accent="warning" />
        </div>

        {/* Main grid */}
        <div className={styles.contentGrid}>
          {/* Recent Voyages */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Recent Voyages</h2>
              <span className={styles.cardCount}>{voyages.length}</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Voyage</th>
                    <th>Vessel</th>
                    <th>Service</th>
                    <th>Utilization</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVoyages.map((v: any) => (
                    <tr key={v._id}>
                      <td className={styles.cellMono}>{v.voyageNumber}</td>
                      <td>{v.vesselName}</td>
                      <td className={styles.cellMuted}>{v.serviceCode}</td>
                      <td>
                        <UtilizationBar used={v.palletsBooked} total={v.palletsCapacity} />
                      </td>
                      <td><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stowage Plans */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Stowage Plans</h2>
              <span className={styles.cardCount}>{plans.length}</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Voyage</th>
                    <th>Loaded</th>
                    <th>Issues</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPlans.map((p: any) => (
                    <ClickablePlanRow key={p._id} planId={p._id}>
                      <td className={styles.cellMono}>{p.planNumber}</td>
                      <td className={styles.cellMuted}>{p.voyageNumber}</td>
                      <td>
                        <UtilizationBar used={p.palletsAssigned} total={p.palletsTotal} />
                      </td>
                      <td>
                        <IssueIndicators
                          overstow={p.overstowViolations}
                          tempConflicts={p.temperatureConflicts}
                        />
                      </td>
                      <td><StatusBadge status={p.status} /></td>
                    </ClickablePlanRow>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pending bookings */}
        {pendingBookings.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Bookings Requiring Attention</h2>
              <span className={styles.cardCount}>{pendingBookings.length}</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Voyage</th>
                    <th>Client</th>
                    <th>Cargo</th>
                    <th>Qty</th>
                    <th>Route</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBookings.map((b: any) => (
                    <tr key={b._id}>
                      <td className={styles.cellMono}>{b.bookingNumber}</td>
                      <td className={styles.cellMuted}>{b.voyageNumber}</td>
                      <td>{b.clientName}</td>
                      <td className={styles.cellCargo}>
                        <CargoIcon type={b.cargoType} />
                        {formatCargoType(b.cargoType)}
                      </td>
                      <td className={styles.cellRight}>{b.requestedQuantity} plt</td>
                      <td className={styles.cellMuted}>{b.polCode} → {b.podCode}</td>
                      <td><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'blue' | 'cyan' | 'yellow' | 'warning';
}) {
  const accentColors: Record<string, string> = {
    blue: 'var(--color-blue)',
    cyan: 'var(--color-cyan)',
    yellow: 'var(--color-yellow)',
    warning: 'var(--color-warning)',
  };

  return (
    <div className={styles.statCard}>
      <div className={styles.statAccent} style={{ backgroundColor: accentColors[accent] }} />
      <div className={styles.statContent}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

function IssueIndicators({ overstow, tempConflicts }: { overstow: number; tempConflicts: number }) {
  if (overstow === 0 && tempConflicts === 0) {
    return <span className={styles.issueNone}>✓ Clear</span>;
  }
  return (
    <div className={styles.issues}>
      {overstow > 0 && (
        <span className={styles.issueTag} style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)' }}>
          {overstow} overstow
        </span>
      )}
      {tempConflicts > 0 && (
        <span className={styles.issueTag} style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)' }}>
          {tempConflicts} temp
        </span>
      )}
    </div>
  );
}

function CargoIcon({ type }: { type: CargoType }) {
  const colors: Record<string, string> = {
    BANANAS: 'var(--color-yellow)',
    FROZEN_FISH: 'var(--color-blue)',
    TABLE_GRAPES: 'var(--color-success)',
    CITRUS: 'var(--color-warning)',
    AVOCADOS: 'var(--color-success)',
    BERRIES: 'var(--color-danger)',
    KIWIS: 'var(--color-success)',
    OTHER_FROZEN: 'var(--color-blue-light)',
    OTHER_CHILLED: 'var(--color-cyan)',
  };
  return (
    <span
      className={styles.cargoDot}
      style={{ background: colors[type] || 'var(--color-text-muted)' }}
    />
  );
}

function formatCargoType(type: CargoType): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
