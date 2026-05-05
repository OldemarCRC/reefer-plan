// ============================================================================
// SHIPPER PORTAL — My Forecasts list
// ============================================================================

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getMyForecasts } from '@/app/actions/space-forecast';
import styles from './page.module.css';

const PLAN_IMPACT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PENDING_REVIEW:       { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)',        label: 'Pending Review'      },
  INCORPORATED:         { bg: 'var(--color-success-muted)', color: 'var(--color-success)',         label: 'Incorporated'        },
  SUPERSEDED:           { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)',   label: 'Superseded'          },
  REPLACED_BY_BOOKING:  { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)',      label: 'Replaced by Booking' },
  NO_CHANGE:            { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)',   label: 'No Change'           },
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ShipperForecastsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if ((session.user as any).role !== 'EXPORTER') redirect('/shipper');

  const { submitted } = await searchParams;
  const submittedCount = submitted ? parseInt(submitted, 10) : null;

  const result = await getMyForecasts();
  const forecasts = result.success ? result.data : [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Forecasts</h1>
          <p className={styles.pageSubtitle}>Your space estimates submitted to the planning team.</p>
        </div>
        <Link href="/shipper/forecasts/new" className={styles.btnPrimary}>
          + New Forecast
        </Link>
      </div>

      {submittedCount !== null && submittedCount > 0 && (
        <div className={styles.banner}>
          {submittedCount} estimate{submittedCount !== 1 ? 's' : ''} submitted successfully.
        </div>
      )}

      {forecasts.length === 0 ? (
        <div className={styles.emptyState}>
          No forecasts submitted yet. Use New Forecast to submit estimates.
        </div>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Voyage</th>
                <th>Service</th>
                <th>Contract</th>
                <th>Cargo</th>
                <th>Pallets</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {(forecasts as any[]).map((f: any) => {
                const impact = PLAN_IMPACT_STYLES[f.planImpact] ?? PLAN_IMPACT_STYLES.NO_CHANGE;
                return (
                  <tr key={f._id?.toString()}>
                    <td className={styles.mono}>{f.voyageNumber || '—'}</td>
                    <td className={styles.mono}>{f.serviceCode || '—'}</td>
                    <td className={styles.mono}>{f.contractNumber || '—'}</td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      {f.cargoType ? (f.cargoType as string).replace(/_/g, ' ') : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
                      {f.source === 'NO_CARGO' ? (
                        <span
                          className={styles.badge}
                          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                        >
                          No Cargo Declared
                        </span>
                      ) : (
                        `${f.estimatedPallets ?? '—'} plt`
                      )}
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{ background: impact.bg, color: impact.color }}
                      >
                        {impact.label}
                      </span>
                    </td>
                    <td className={styles.mono}>{fmtDate(f.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
