import AppShell from '@/components/layout/AppShell';
import { getVoyageById } from '@/app/actions/voyage';
import { getStowagePlansByVoyage } from '@/app/actions/stowage-plan';
import { getBookingsByVoyage } from '@/app/actions/booking';
import Link from 'next/link';
import styles from './page.module.css';
import { DeleteVoyageButton, PortCallsEditor, DeletePlanButton } from './VoyageDetailClient';

const statusStyles: Record<string, { bg: string; color: string }> = {
  IN_PROGRESS: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PLANNED: { bg: 'var(--color-blue-muted)', color: 'var(--color-blue-light)' },
  ESTIMATED: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  COMPLETED: { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' },
  CANCELLED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: style.bg, color: style.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '—';
  }
}

export default async function VoyageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const voyageResult = await getVoyageById(id);

  if (!voyageResult.success) {
    return (
      <AppShell>
        <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
          Voyage not found.{' '}
          <Link href="/voyages" style={{ color: 'var(--color-blue-light)' }}>← Back to Voyages</Link>
        </div>
      </AppShell>
    );
  }

  const voyage = voyageResult.data;
  const portCalls: any[] = (voyage.portCalls || []).slice().sort((a: any, b: any) => {
    const ta = a.eta ? new Date(a.eta).getTime() : (a.sequence ?? 0) * 1e10;
    const tb = b.eta ? new Date(b.eta).getTime() : (b.sequence ?? 0) * 1e10;
    return ta - tb;
  });
  // Parallel fetches
  const [plansResult, bookingsResult] = await Promise.all([
    getStowagePlansByVoyage(id),
    getBookingsByVoyage(id),
  ]);

  const plans = plansResult.success ? plansResult.data : [];
  const bookings = bookingsResult.success ? bookingsResult.data : [];

  const vesselName = voyage.vesselId?.name || voyage.vesselName || '—';
  const vesselImo = (voyage.vesselId as any)?.imoNumber ?? null;
  const serviceCode = voyage.serviceId?.serviceCode || 'N/A';

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.titleRow}>
              <Link href="/voyages" className={styles.backLink}>← Voyages</Link>
              <span className={styles.separator}>/</span>
              <h1 className={styles.pageTitle}>{voyage.voyageNumber}</h1>
              <StatusBadge status={voyage.status || 'PLANNED'} />
            </div>
            <p className={styles.pageSubtitle}>
              {vesselName}
              {vesselImo && (
                <a
                  href={`https://www.marinetraffic.com/en/ais/details/ships/imo:${vesselImo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.mtLink}
                  title={`Track ${vesselName} on MarineTraffic (IMO ${vesselImo})`}
                >
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 1h4v4" />
                    <path d="M11 1L5.5 6.5" />
                    <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" />
                  </svg>
                </a>
              )}
              {' · '}{serviceCode}
              {(voyage as any).weekNumber != null && ` · WK${String((voyage as any).weekNumber).padStart(2, '0')}`}
              {' · '}Departure {formatDate(voyage.departureDate)}
            </p>
          </div>
          <div className={styles.headerActions}>
            {plans.length > 0 && (
              <Link href={`/stowage-plans/${plans[0]._id}`} className={styles.btnPrimary}>
                Open Stowage Plan
              </Link>
            )}
            <Link href={`/stowage-plans/new?voyageId=${id}`} className={styles.btnSecondary}>
              + New Plan
            </Link>
            <DeleteVoyageButton
              voyageId={id}
              voyageNumber={voyage.voyageNumber}
              voyageStatus={voyage.status || 'PLANNED'}
            />
          </div>
        </div>

        {/* Port Calls (editable) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Port Calls</h2>
            <span className={styles.cardCount}>{portCalls.length} ports</span>
          </div>
          {portCalls.length === 0 ? (
            <p className={styles.cellMuted}>No port calls defined for this voyage.</p>
          ) : (
            <PortCallsEditor
              voyageId={id}
              portCalls={portCalls.map((pc: any) => ({
                portCode: pc.portCode,
                portName: pc.portName,
                country: pc.country ?? '',
                sequence: pc.sequence ?? 0,
                eta: pc.eta ?? null,
                etd: pc.etd ?? null,
                operations: pc.operations ?? [],
                locked: pc.locked ?? false,
                status: pc.status ?? 'SCHEDULED',
              }))}
            />
          )}
        </div>

        {/* Bookings Section */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Bookings</h2>
            <span className={styles.cardCount}>{bookings.length} bookings</span>
          </div>
          {bookings.length === 0 ? (
            <p className={styles.cellMuted}>No bookings for this voyage yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>Client</th>
                    <th>Cargo</th>
                    <th>Requested</th>
                    <th>Confirmed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b: any) => (
                    <tr key={b._id}>
                      <td className={styles.cellMono}>{b.bookingNumber}</td>
                      <td>{b.clientName || '—'}</td>
                      <td>{b.cargoType ? b.cargoType.replace(/_/g, ' ') : '—'}</td>
                      <td className={styles.cellRight}>{b.requestedQuantity ?? '—'} plt</td>
                      <td className={styles.cellRight}>{b.confirmedQuantity ?? '—'} plt</td>
                      <td>
                        <StatusBadge status={b.status || 'PENDING'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stowage Plans Section */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Stowage Plans</h2>
            <Link href={`/stowage-plans/new?voyageId=${id}`} className={styles.btnSecondary}>
              + New Plan
            </Link>
          </div>
          {plans.length === 0 ? (
            <p className={styles.cellMuted}>No stowage plans for this voyage.</p>
          ) : (
            <div className={styles.planList}>
              {plans.map((plan: any) => (
                <div key={plan._id} className={styles.planRow}>
                  <div className={styles.planInfo}>
                    <span className={styles.planName}>{plan.planNumber || `Plan ${plan._id.slice(-6)}`}</span>
                    <span className={styles.planMeta}>
                      {plan.status || 'DRAFT'} · Created {formatDate(plan.createdAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link href={`/stowage-plans/${plan._id}`} className={styles.btnGhost}>
                      Open →
                    </Link>
                    <DeletePlanButton
                      planId={plan._id}
                      planNumber={plan.planNumber || `Plan ${plan._id.slice(-6)}`}
                      voyageId={id}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
