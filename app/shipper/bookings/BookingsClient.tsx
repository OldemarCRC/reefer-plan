'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateBookingQuantity } from '@/app/actions/booking';
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
  const [editTarget, setEditTarget] = useState<ShipperBooking | null>(null);

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
        <Link href="/shipper/request" className={styles.filterNewBtn}>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const s = STATUS_COLORS[b.status] ?? STATUS_COLORS.CANCELLED;
                return (
                  <tr key={b._id}>
                    <td data-label="Booking #">
                      <Link href={`/shipper/bookings/${b._id}`} className={styles.tableLink}>
                        {b.bookingNumber}
                      </Link>
                    </td>
                    <td data-label="Voyage" className={styles.mono}>{b.voyageNumber || '—'}</td>
                    <td data-label="Service" className={styles.mono}>{b.serviceCode}</td>
                    <td data-label="Cargo Type">{b.cargoType.replace(/_/g, ' ')}</td>
                    <td data-label="Req." className={styles.mono}>{b.requestedQuantity}</td>
                    <td data-label="Conf." className={styles.mono}>{b.confirmedQuantity || '—'}</td>
                    <td data-label="Stby." className={styles.mono}>{b.standbyQuantity || '—'}</td>
                    <td data-label="Route">
                      <div className={styles.portRoute}>
                        <span>{b.pol?.portCode ?? '—'}</span>
                        <span className={styles.portArrow}>→</span>
                        <span>{b.pod?.portCode ?? '—'}</span>
                      </div>
                    </td>
                    <td data-label="Requested" className={styles.mono}>{fmtDate(b.requestedDate)}</td>
                    <td data-label="Status">
                      <span className={styles.badge} style={{ background: s.bg, color: s.color }}>
                        {b.status}
                      </span>
                    </td>
                    <td data-label="Actions">
                      {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                        <button
                          className={styles.btnSecondary}
                          onClick={() => setEditTarget(b)}
                          style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                        >
                          Edit
                        </button>
                      )}
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

      {editTarget && (
        <EditBookingModal
          booking={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Booking Modal (Shipper portal)
// ---------------------------------------------------------------------------

function EditBookingModal({
  booking,
  onClose,
}: {
  booking: ShipperBooking;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [qty, setQty] = useState(booking.requestedQuantity);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    if (qty < 1) { setError('Quantity must be at least 1'); return; }
    setError('');
    startTransition(async () => {
      const result = await updateBookingQuantity({
        bookingId: booking._id,
        requestedQuantity: qty,
        notes: notes.trim() || undefined,
      });
      if (!result.success) { setError(result.error ?? 'Failed to update'); return; }
      router.refresh();
      onClose();
    });
  }

  function handleCancel() {
    if (!confirm(`Cancel booking ${booking.bookingNumber}? This cannot be undone.`)) return;
    setError('');
    startTransition(async () => {
      const result = await updateBookingQuantity({
        bookingId: booking._id,
        requestedQuantity: booking.requestedQuantity,
        status: 'CANCELLED',
      });
      if (!result.success) { setError(result.error ?? 'Failed to cancel'); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', width: '100%', maxWidth: '480px' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>Edit Booking</h3>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          {booking.bookingNumber}
        </p>

        {error && (
          <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
            {error}
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Requested Pallets</label>
          <input
            type="number"
            className={styles.formInput}
            min={1}
            max={10000}
            value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Notes (optional)</label>
          <textarea
            className={styles.formInput}
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Add a note to this booking..."
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
          <button
            style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginRight: 'auto' }}
            disabled={isPending}
            onClick={handleCancel}
          >
            Cancel Booking
          </button>
          <button
            style={{ padding: '6px 14px', fontSize: 'var(--text-sm)', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
            onClick={onClose}
            disabled={isPending}
          >
            Dismiss
          </button>
          <button
            className={styles.btnPrimary}
            disabled={isPending}
            onClick={handleSave}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
