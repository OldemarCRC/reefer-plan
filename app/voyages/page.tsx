import AppShell from '@/components/layout/AppShell';
import { getVoyages } from '@/app/actions/voyage';
import styles from './page.module.css';

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

function UtilizationBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const barColor = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-cyan)';
  return (
    <div className={styles.utilBar}>
      <div className={styles.utilTrack}>
        <div className={styles.utilFill} style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className={styles.utilPct}>{pct}%</span>
      <span className={styles.utilDetail}>{used.toLocaleString()}/{total.toLocaleString()}</span>
    </div>
  );
}

export default async function VoyagesPage() {
  // Fetch voyages from database
  const result = await getVoyages();
  const voyages = result.success ? result.data : [];

  // Transform database data to match component expectations
  const displayVoyages = voyages.map((v: any) => ({
    _id: v._id,
    voyageNumber: v.voyageNumber,
    status: v.status || 'PLANNED',
    vesselName: v.vesselName,
    serviceCode: v.serviceId?.serviceCode || 'N/A',
    startDate: v.departureDate ? new Date(v.departureDate).toLocaleDateString() : 'TBD',
    portCalls: (v.portCalls || []).map((pc: any) => ({
      portCode: pc.portCode,
      portName: pc.portName,
      operations: pc.operations || [],
      locked: false, // TODO: implement port locking logic
    })),
    bookingsCount: 0, // TODO: fetch booking count from database
    palletsBooked: 0, // TODO: calculate from bookings
    palletsCapacity: 1800, // TODO: fetch from vessel capacity
  }));

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Voyages</h1>
            <p className={styles.pageSubtitle}>{displayVoyages.length} voyages</p>
          </div>
          <button className={styles.btnPrimary}>+ New Voyage</button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <input className={styles.search} type="text" placeholder="Search voyages..." />
          <select className={styles.select}>
            <option value="">All Services</option>
            <option value="SEABAN">SEABAN</option>
            <option value="SEAMED">SEAMED</option>
          </select>
          <select className={styles.select}>
            <option value="">All Status</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PLANNED">Planned</option>
            <option value="ESTIMATED">Estimated</option>
          </select>
        </div>

        {/* Voyage cards */}
        <div className={styles.voyageList}>
          {displayVoyages.map((v) => (
            <div key={v._id} className={styles.voyageCard}>
              {/* Card header */}
              <div className={styles.voyageHeader}>
                <div className={styles.voyageId}>
                  <span className={styles.voyageCode}>{v.voyageNumber}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div className={styles.voyageMeta}>
                  <span>{v.vesselName}</span>
                  <span className={styles.dot}>·</span>
                  <span className={styles.muted}>{v.serviceCode}</span>
                  <span className={styles.dot}>·</span>
                  <span className={styles.muted}>{v.startDate}</span>
                </div>
              </div>

              {/* Port call timeline */}
              <div className={styles.timeline}>
                {v.portCalls.map((pc, i) => {
                  const isLoad = pc.operations.includes('LOAD');
                  return (
                    <div key={i} className={styles.timelineStop}>
                      <div className={styles.timelineDot} data-type={isLoad ? 'load' : 'discharge'}>
                        {pc.locked && (
                          <svg className={styles.lockIcon} viewBox="0 0 12 12" fill="currentColor">
                            <path d="M9 5V4a3 3 0 10-6 0v1H2v6h8V5H9zM4 4a2 2 0 114 0v1H4V4z" />
                          </svg>
                        )}
                      </div>
                      {i < v.portCalls.length - 1 && <div className={styles.timelineLine} />}
                      <div className={styles.timelineInfo}>
                        <span className={styles.portCode}>{pc.portCode}</span>
                        <span className={styles.portName}>{pc.portName}</span>
                        <span className={styles.portOp}>
                          {isLoad ? '▲ Load' : '▼ Discharge'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Card footer */}
              <div className={styles.voyageFooter}>
                <div className={styles.voyageStat}>
                  <span className={styles.voyageStatLabel}>Bookings</span>
                  <span className={styles.voyageStatValue}>{v.bookingsCount}</span>
                </div>
                <div className={styles.voyageUtilWrap}>
                  <span className={styles.voyageStatLabel}>Utilization</span>
                  <UtilizationBar used={v.palletsBooked} total={v.palletsCapacity} />
                </div>
                <button className={styles.btnGhost}>View Details →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
