// ============================================================================
// SHIPPER PORTAL — Pending Submissions
// ============================================================================

import Link from 'next/link';
import { getPendingRequestsForShipper } from '@/app/actions/shipper';
import styles from '../shipper.module.css';

function fmtDate(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function PendingPage() {
  const result = await getPendingRequestsForShipper();
  const items = result.success ? result.data ?? [] : [];

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pending Submissions</h1>
          <p className={styles.pageSubtitle}>
            Upcoming voyages awaiting your estimate or booking request.
          </p>
        </div>
        <Link href="/shipper" className={styles.sectionLink}>← Back to overview</Link>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>All caught up — no pending submissions</div>
          <div className={styles.emptyStateDesc}>
            You have submitted estimates or bookings for all upcoming voyages on your contracts.
          </div>
        </div>
      ) : (
        <div className={styles.pendingGrid}>
          {items.map((item) => {
            const loadPorts = item.portCalls
              .filter(p => p.type === 'LOAD')
              .sort((a, b) => a.sequence - b.sequence)
              .map(p => p.portCode);
            const dischPorts = item.portCalls
              .filter(p => p.type === 'DISCHARGE')
              .sort((a, b) => a.sequence - b.sequence)
              .map(p => p.portCode);
            const dep = fmtDate(item.departureDate);

            return (
              <div key={`${item.voyageId}-${item.contractId}`} className={styles.pendingCard}>
                <div className={styles.pendingCardTop}>
                  <div>
                    <div className={styles.pendingCardVoyage}>{item.voyageNumber}</div>
                    <div className={styles.pendingCardVessel}>{item.vesselName}</div>
                  </div>
                  <div className={styles.pendingCardWeek}>
                    Wk {String(item.weekNumber).padStart(2, '0')}
                  </div>
                </div>

                <div className={styles.pendingCardMeta}>
                  {dep && <span>Dep. {dep}</span>}
                  <div className={styles.portRoute}>
                    <span>{loadPorts.join(', ') || '—'}</span>
                    <span className={styles.portArrow}>→</span>
                    <span>{dischPorts.join(', ') || '—'}</span>
                  </div>
                </div>

                <div className={styles.pendingCardCargo}>
                  {item.cargoType.replace(/_/g, ' ')}
                  {item.weeklyEstimate > 0 && (
                    <span className={styles.mutedText}> · ~{item.weeklyEstimate} plt/wk</span>
                  )}
                </div>

                <div className={styles.cardActions}>
                  {item.forecastStatus === 'HAS_ESTIMATE' ? (
                    <button
                      className={styles.btnActionSmDone}
                      disabled
                    >
                      ✓ Estimate sent
                    </button>
                  ) : (
                    <Link
                      href={`/shipper/forecasts/new?voyageId=${item.voyageId}&contractId=${item.contractId}`}
                      className={styles.btnActionSmSecondary}
                    >
                      Submit Estimate
                    </Link>
                  )}

                  <Link href="/shipper/request" className={styles.btnActionSm}>
                    Request Booking
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
