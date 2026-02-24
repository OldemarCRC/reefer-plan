// ============================================================================
// SHIPPER PORTAL — Voyage Schedules
// ============================================================================

import { getShipperSchedules } from '@/app/actions/shipper';
import styles from '../shipper.module.css';

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

function countryFlag(country: string) {
  if (!country || country.length !== 2) return '';
  return country.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

export default async function ShipperSchedulesPage() {
  const result = await getShipperSchedules();

  if (!result.success) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Voyage Schedules</h1>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>Failed to load schedules</div>
        </div>
      </div>
    );
  }

  const services = result.data;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Voyage Schedules</h1>
        <p className={styles.pageSubtitle}>Upcoming sailings across all services. Dates are estimated and subject to change.</p>
      </div>

      {services.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>🗓</div>
          <div className={styles.emptyStateTitle}>No upcoming voyages</div>
          <div className={styles.emptyStateDesc}>Check back later for scheduled sailings.</div>
        </div>
      ) : (
        services.map((svc: any) => (
          <div key={svc.serviceCode} className={styles.serviceSection}>
            <div className={styles.serviceHeader}>
              <span className={styles.serviceCode}>{svc.serviceCode}</span>
              <span className={styles.serviceName}>{svc.serviceName}</span>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Voyage</th>
                    <th>Vessel</th>
                    <th>Departure</th>
                    <th>Port Rotation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {svc.voyages.map((v: any) => {
                    const vs = VOYAGE_STATUS_COLORS[v.status] ?? VOYAGE_STATUS_COLORS.PLANNED;
                    const ports = [...v.portCalls].sort((a: any, b: any) => a.sequence - b.sequence);
                    return (
                      <tr key={v._id}>
                        <td className={styles.mono}>{v.voyageNumber}</td>
                        <td style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
                          {v.vesselName}
                        </td>
                        <td className={styles.mono}>{fmtDate(v.departureDate)}</td>
                        <td>
                          <div className={styles.portChain} style={{ flexWrap: 'nowrap' }}>
                            {ports.map((pc: any, i: number) => (
                              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                  {countryFlag(pc.country)} {pc.portCode}
                                </span>
                                {pc.eta && (
                                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                                    {new Date(pc.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                                {i < ports.length - 1 && (
                                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}> →</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={styles.badge} style={{ background: vs.bg, color: vs.color }}>
                            {v.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
