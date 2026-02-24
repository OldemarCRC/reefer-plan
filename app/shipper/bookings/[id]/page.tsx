// ============================================================================
// SHIPPER PORTAL — Booking Detail
// ============================================================================

import { auth } from '@/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBookingById } from '@/app/actions/booking';
import { getShipperSchedules } from '@/app/actions/shipper';
import styles from '../../shipper.module.css';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PARTIAL:   { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)' },
  STANDBY:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  REJECTED:  { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

const VOYAGE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PLANNED:     { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
  ESTIMATED:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED:   { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  IN_PROGRESS: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  COMPLETED:   { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function countryFlag(country: string) {
  if (!country || country.length !== 2) return '';
  return country.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  const result = await getBookingById(params.id);
  if (!result.success || !result.data) {
    notFound();
  }

  const booking = result.data;

  // Security: ensure the booking belongs to this shipper
  if (shipperCode && booking.shipper?.code !== shipperCode) {
    notFound();
  }

  // Find the voyage details from schedules (reuse existing action)
  let voyage: any = null;
  if (booking.voyageId) {
    const schedResult = await getShipperSchedules();
    if (schedResult.success) {
      for (const svc of schedResult.data) {
        const found = svc.voyages.find((v: any) => v._id === booking.voyageId?.toString());
        if (found) { voyage = found; break; }
      }
    }
  }

  const bookingStatus = STATUS_COLORS[booking.status] ?? STATUS_COLORS.CANCELLED;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <Link href="/shipper/bookings" style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← My Bookings
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <h1 className={styles.pageTitle} style={{ margin: 0 }}>{booking.bookingNumber}</h1>
          <span className={styles.badge} style={{ background: bookingStatus.bg, color: bookingStatus.color }}>
            {booking.status}
          </span>
        </div>
        <p className={styles.pageSubtitle}>Requested {fmtDate(booking.requestedDate)}</p>
      </div>

      {/* Cargo Card */}
      <div className={styles.detailCard}>
        <div className={styles.detailCardTitle}>Cargo Details</div>
        <div className={styles.detailGrid}>
          <div className={styles.detailField}>
            <label>Cargo Type</label>
            <span>{booking.cargoType?.replace(/_/g, ' ')}</span>
          </div>
          <div className={styles.detailField}>
            <label>Requested Pallets</label>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{booking.requestedQuantity}</span>
          </div>
          <div className={styles.detailField}>
            <label>Confirmed Pallets</label>
            <span style={{ fontFamily: 'var(--font-mono)', color: booking.confirmedQuantity > 0 ? 'var(--color-success)' : undefined }}>
              {booking.confirmedQuantity > 0 ? booking.confirmedQuantity : '—'}
            </span>
          </div>
          <div className={styles.detailField}>
            <label>Standby Pallets</label>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {booking.standbyQuantity > 0 ? booking.standbyQuantity : '—'}
            </span>
          </div>
          {booking.requestedTemperature !== null && booking.requestedTemperature !== undefined && (
            <div className={styles.detailField}>
              <label>Requested Temp.</label>
              <span>{booking.requestedTemperature}°C</span>
            </div>
          )}
          <div className={styles.detailField}>
            <label>Shipper</label>
            <span>{booking.shipper?.name}</span>
          </div>
          <div className={styles.detailField}>
            <label>Consignee</label>
            <span>{booking.consignee?.name}</span>
          </div>
          <div className={styles.detailField}>
            <label>POL (Loading)</label>
            <span>{booking.pol?.portName} ({booking.pol?.portCode})</span>
          </div>
          <div className={styles.detailField}>
            <label>POD (Discharge)</label>
            <span>{booking.pod?.portName} ({booking.pod?.portCode})</span>
          </div>
          {booking.rejectionReason && (
            <div className={styles.detailField} style={{ gridColumn: '1 / -1' }}>
              <label>Rejection Reason</label>
              <span style={{ color: 'var(--color-danger)' }}>{booking.rejectionReason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Voyage Card */}
      {voyage ? (
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Voyage</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
              {voyage.voyageNumber}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {voyage.vesselName}
            </span>
            {voyage.status && (() => {
              const vs = VOYAGE_STATUS_COLORS[voyage.status] ?? VOYAGE_STATUS_COLORS.PLANNED;
              return (
                <span className={styles.badge} style={{ background: vs.bg, color: vs.color }}>
                  {voyage.status.replace(/_/g, ' ')}
                </span>
              );
            })()}
          </div>

          {/* Port Call Timeline */}
          <div className={styles.timeline}>
            {voyage.portCalls.map((pc: any, i: number) => {
              const isLoad = pc.operations?.includes('LOAD');
              const isDischarge = pc.operations?.includes('DISCHARGE');
              const isPol = booking.pol?.portCode === pc.portCode;
              const isPod = booking.pod?.portCode === pc.portCode;

              let dotClass = styles.timelineDot;
              if (pc.locked) dotClass += ` ${styles['timelineDot--locked']}`;
              else if (isLoad) dotClass += ` ${styles['timelineDot--load']}`;
              else if (isDischarge) dotClass += ` ${styles['timelineDot--discharge']}`;

              return (
                <div key={i} className={styles.timelineItem}>
                  <div className={dotClass} />
                  <div className={styles.timelinePort}>
                    {countryFlag(pc.country)} {pc.portName}
                    {(isPol || isPod) && (
                      <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '10px',
                        fontWeight: 'var(--weight-bold)',
                        color: isPol ? 'var(--color-success)' : 'var(--color-warning)',
                        background: isPol ? 'var(--color-success-muted)' : 'var(--color-warning-muted)',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        {isPol ? 'LOADING' : 'DISCHARGE'}
                      </span>
                    )}
                  </div>
                  <div className={styles.timelineMeta}>
                    {pc.eta && <span>ETA {fmtDateTime(pc.eta)}</span>}
                    {pc.etd && <span>ETD {fmtDateTime(pc.etd)}</span>}
                    {pc.locked && (
                      <span className={styles.timelineLocked}>🔒 Locked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        booking.voyageNumber && (
          <div className={styles.detailCard}>
            <div className={styles.detailCardTitle}>Voyage</div>
            <span className={styles.mono} style={{ color: 'var(--color-text-secondary)' }}>
              {booking.voyageNumber}
            </span>
          </div>
        )
      )}
    </div>
  );
}
