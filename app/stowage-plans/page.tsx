import AppShell from '@/components/layout/AppShell';
import { getStowagePlans } from '@/app/actions/stowage-plan';
import AutoGenerateButton from './AutoGenerateButton';
import AdvancedOptimizeButton from './AdvancedOptimizeButton';
import CapacityBar from '@/components/ui/CapacityBar/CapacityBar';
import styles from './page.module.css';
import Link from 'next/link';

const statusStyles: Record<string, { bg: string; color: string }> = {
  ESTIMATED: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  DRAFT: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  READY_FOR_CAPTAIN: { bg: 'var(--color-cyan-muted)', color: 'var(--color-cyan)' },
  EMAIL_SENT: { bg: 'var(--color-blue-muted)', color: 'var(--color-blue-light)' },
  CAPTAIN_APPROVED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  CAPTAIN_REJECTED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
  IN_REVISION: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  READY_FOR_EXECUTION: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  IN_EXECUTION: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
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

export default async function StowagePlansPage() {
  const result = await getStowagePlans();
  const plans = result.success ? result.data : [];

  const displayPlans = plans.map((p: any) => {
    const vessel = p.vesselId;
    const palletsTotal = vessel?.temperatureZones
      ? (vessel.temperatureZones as any[]).reduce(
          (sum: number, zone: any) =>
            sum + ((zone.coolingSections as any[]) || []).reduce(
              (s: number, sec: any) =>
                s + Math.floor((sec.sqm || 0) * (sec.designStowageFactor || 1.32)),
              0
            ),
          0
        )
      : 0;

    return {
      _id: p._id,
      planNumber: p.planNumber || `PLAN-${p._id.toString().slice(-6)}`,
      status: p.status || 'DRAFT',
      vesselName: vessel?.name || p.vesselName || 'Unknown Vessel',
      voyageNumber: p.voyageId?.voyageNumber || p.voyageNumber || 'N/A',
      updatedAt: p.updatedAt
        ? new Date(p.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A',
      palletsAssigned: ((p.cargoPositions as any[]) || [])
        .filter((cp: any) => {
          const bid = cp.bookingId?.toString() ?? '';
          return !bid.startsWith('FORECAST-') && !bid.startsWith('CONTRACT-ESTIMATE-');
        })
        .reduce((sum: number, cp: any) => sum + (cp.quantity || 0), 0),
      palletsTotal,
      estimatedPalletsTotal: p.estimatedPalletsTotal ?? 0,
      overstowViolations: p.overstowViolations?.length || 0,
      temperatureConflicts: p.temperatureConflicts?.length || 0,
      bookingCount: p.realBookingCount ?? 0,
      estimateCount: p.estimateCount ?? 0,
    };
  });

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Stowage Plans</h1>
            <p className={styles.pageSubtitle}>{displayPlans.length} plans</p>
          </div>
          <AutoGenerateButton />
          <AdvancedOptimizeButton />
          <Link href={`/stowage-plans/new/`} className={styles.btnGhost}>
            + New Plan
          </Link>
        </div>

        <div className={styles.planList}>
          {displayPlans.map((p: any) => {
            const hasIssues = p.overstowViolations > 0 || p.temperatureConflicts > 0;

            return (
              <div key={p._id} className={styles.planCard}>
                <div className={styles.planHeader}>
                  <div className={styles.planId}>
                    <span className={styles.planCode}>{p.planNumber}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className={styles.planMeta}>
                    <span>{p.vesselName}</span>
                    <span className={styles.dot}>·</span>
                    <span className={styles.muted}>{p.voyageNumber}</span>
                    <span className={styles.dot}>·</span>
                    <span className={styles.muted}>
                      {p.bookingCount} booking{p.bookingCount !== 1 ? 's' : ''}
                      {p.estimateCount > 0 ? ` · ${p.estimateCount} estimate${p.estimateCount !== 1 ? 's' : ''}` : ''}
                    </span>
                    <span className={styles.dot}>·</span>
                    <span className={styles.muted}>Updated {p.updatedAt}</span>
                  </div>
                </div>

                <CapacityBar
                  bookedPallets={p.palletsAssigned}
                  estimatedPallets={p.estimatedPalletsTotal}
                  totalCapacity={p.palletsTotal}
                  size="md"
                />

                {/* Validation status */}
                <div className={styles.validation}>
                  <div className={`${styles.validItem} ${!hasIssues ? styles.validOk : ''}`}>
                    {p.overstowViolations === 0 ? (
                      <><span className={styles.checkIcon}>✓</span> No overstow</>
                    ) : (
                      <><span className={styles.warnIcon}>!</span> {p.overstowViolations} overstow violation{p.overstowViolations > 1 ? 's' : ''}</>
                    )}
                  </div>
                  <div className={`${styles.validItem} ${p.temperatureConflicts === 0 ? styles.validOk : ''}`}>
                    {p.temperatureConflicts === 0 ? (
                      <><span className={styles.checkIcon}>✓</span> No temp conflicts</>
                    ) : (
                      <><span className={styles.warnIcon}>!</span> {p.temperatureConflicts} temp conflict{p.temperatureConflicts > 1 ? 's' : ''}</>
                    )}
                  </div>
                </div>
                <div className={styles.planFooter}>
                  <Link href={`/stowage-plans/${p._id}`} className={styles.btnGhost}>
                    Open Plan →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
