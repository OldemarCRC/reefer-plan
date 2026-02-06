import AppShell from '@/components/layout/AppShell';
import { mockBookings } from '@/lib/mock-data';
import styles from './page.module.css';
import type { CargoType } from '@/types/models';

const statusStyles: Record<string, { bg: string; color: string }> = {
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PENDING: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  PARTIAL: { bg: 'var(--color-yellow-muted)', color: 'var(--color-yellow)' },
  STANDBY: { bg: 'var(--color-info-muted)', color: 'var(--color-info)' },
  REJECTED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

const cargoColors: Record<string, string> = {
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

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: style.bg, color: style.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatCargo(type: CargoType): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BookingsPage() {
  const confirmed = mockBookings.filter((b) => b.status === 'CONFIRMED').length;
  const pending = mockBookings.filter((b) => b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL').length;

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Bookings</h1>
            <p className={styles.pageSubtitle}>
              {mockBookings.length} total · {confirmed} confirmed · {pending} pending action
            </p>
          </div>
          <button className={styles.btnPrimary}>+ New Booking</button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <input className={styles.search} type="text" placeholder="Search by booking, client, consignee..." />
          <select className={styles.select}>
            <option value="">All Voyages</option>
            <option value="ACON-062026">ACON-062026</option>
            <option value="ACON-072026">ACON-072026</option>
          </select>
          <select className={styles.select}>
            <option value="">All Cargo</option>
            <option value="BANANAS">Bananas</option>
            <option value="FROZEN_FISH">Frozen Fish</option>
            <option value="TABLE_GRAPES">Table Grapes</option>
            <option value="CITRUS">Citrus</option>
            <option value="AVOCADOS">Avocados</option>
            <option value="BERRIES">Berries</option>
          </select>
          <select className={styles.select}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PARTIAL">Partial</option>
            <option value="STANDBY">Standby</option>
          </select>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Voyage</th>
                  <th>Client</th>
                  <th>Consignee</th>
                  <th>Cargo</th>
                  <th>Requested</th>
                  <th>Confirmed</th>
                  <th>Standby</th>
                  <th>Route</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mockBookings.map((b) => (
                  <tr key={b._id} className={b.status === 'PENDING' || b.status === 'STANDBY' ? styles.rowHighlight : ''}>
                    <td className={styles.cellMono}>{b.bookingNumber}</td>
                    <td className={styles.cellMuted}>{b.voyageNumber}</td>
                    <td>{b.clientName}</td>
                    <td className={styles.cellMuted}>{b.consigneeName}</td>
                    <td>
                      <div className={styles.cargoCell}>
                        <span
                          className={styles.cargoDot}
                          style={{ background: cargoColors[b.cargoType] || 'var(--color-text-muted)' }}
                        />
                        {formatCargo(b.cargoType)}
                      </div>
                    </td>
                    <td className={styles.cellRight}>{b.requestedQuantity}</td>
                    <td className={styles.cellRight}>
                      {b.confirmedQuantity > 0 ? (
                        <span className={styles.cellConfirmed}>{b.confirmedQuantity}</span>
                      ) : (
                        <span className={styles.cellZero}>—</span>
                      )}
                    </td>
                    <td className={styles.cellRight}>
                      {b.standbyQuantity > 0 ? (
                        <span className={styles.cellStandby}>{b.standbyQuantity}</span>
                      ) : (
                        <span className={styles.cellZero}>—</span>
                      )}
                    </td>
                    <td className={styles.cellRoute}>
                      <span>{b.polCode}</span>
                      <span className={styles.routeArrow}>→</span>
                      <span>{b.podCode}</span>
                    </td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
