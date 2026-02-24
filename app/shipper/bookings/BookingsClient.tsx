'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import styles from '../shipper.module.css';

interface ShipperBooking {
  _id: string;
  bookingNumber: string;
  voyageNumber: string;
  serviceCode: string;
  cargoType: string;
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity: number;
  pol: { portCode: string; portName: string } | null;
  pod: { portCode: string; portName: string } | null;
  status: string;
  requestedDate: string | null;
  createdAt: string | null;
}

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
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

const ALL_STATUSES = ['ALL', 'PENDING', 'CONFIRMED', 'PARTIAL', 'STANDBY', 'REJECTED', 'CANCELLED'];

export default function BookingsClient({
  initialBookings,
  shipperCode,
}: {
  initialBookings: ShipperBooking[];
  shipperCode: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = useMemo(() => {
    return initialBookings.filter(b => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          b.bookingNumber.toLowerCase().includes(q) ||
          b.voyageNumber.toLowerCase().includes(q) ||
          b.serviceCode.toLowerCase().includes(q) ||
          b.cargoType.toLowerCase().includes(q) ||
          b.pol?.portCode.toLowerCase().includes(q) ||
          b.pod?.portCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialBookings, search, statusFilter]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Bookings</h1>
        <p className={styles.pageSubtitle}>
          {shipperCode ? `Shipper code: ${shipperCode}` : 'All cargo bookings for your account.'}
        </p>
      </div>

      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          placeholder="Search bookings, voyages, ports…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
          ))}
        </select>
        <Link
          href="/shipper/request"
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-blue)',
            color: '#fff',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          + New Request
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>📦</div>
          <div className={styles.emptyStateTitle}>
            {initialBookings.length === 0 ? 'No bookings yet' : 'No bookings match your filters'}
          </div>
          <div className={styles.emptyStateDesc}>
            {initialBookings.length === 0
              ? 'Submit a booking request to get started.'
              : 'Try adjusting your search or status filter.'}
          </div>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Booking #</th>
                <th>Voyage</th>
                <th>Service</th>
                <th>Cargo Type</th>
                <th>Req.</th>
                <th>Conf.</th>
                <th>Stby.</th>
                <th>Route</th>
                <th>Requested</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const s = STATUS_COLORS[b.status] ?? STATUS_COLORS.CANCELLED;
                return (
                  <tr key={b._id}>
                    <td>
                      <Link href={`/shipper/bookings/${b._id}`} className={styles.tableLink}>
                        {b.bookingNumber}
                      </Link>
                    </td>
                    <td className={styles.mono}>{b.voyageNumber || '—'}</td>
                    <td className={styles.mono}>{b.serviceCode}</td>
                    <td>{b.cargoType.replace(/_/g, ' ')}</td>
                    <td className={styles.mono}>{b.requestedQuantity}</td>
                    <td className={styles.mono}>{b.confirmedQuantity || '—'}</td>
                    <td className={styles.mono}>{b.standbyQuantity || '—'}</td>
                    <td>
                      <div className={styles.portRoute}>
                        <span>{b.pol?.portCode ?? '—'}</span>
                        <span className={styles.portArrow}>→</span>
                        <span>{b.pod?.portCode ?? '—'}</span>
                      </div>
                    </td>
                    <td className={styles.mono}>{fmtDate(b.requestedDate)}</td>
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

      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        {filtered.length} of {initialBookings.length} bookings shown
      </div>
    </div>
  );
}
