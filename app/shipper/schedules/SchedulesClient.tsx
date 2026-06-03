'use client';

import { useState, Fragment } from 'react';
import { FlagIcon } from '@/lib/utils/flagIcon';
import { type VoyageInfo } from '../VoyageActionModal';
import styles from '../shipper.module.css';

const VOYAGE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PLANNED:     { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
  ESTIMATED:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED:   { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  IN_PROGRESS: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  COMPLETED:   { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

interface ServiceData {
  serviceCode: string;
  serviceName: string;
  voyages: VoyageInfo[];
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SchedulesClient({ services }: { services: ServiceData[] }) {
  const [expandedVoyageId, setExpandedVoyageId] = useState<string | null>(null);

  const toggleRow = (id: string) =>
    setExpandedVoyageId(prev => prev === id ? null : id);

  return (
    <>
      {services.map((svc) => (
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
                  <th className={styles.colDate}>Departure</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {svc.voyages.map((v) => {
                  const vs = VOYAGE_STATUS_COLORS[v.status ?? ''] ?? VOYAGE_STATUS_COLORS.PLANNED;
                  const isExpanded = expandedVoyageId === v._id;

                  const sortedPorts = [...v.portCalls].sort((a, b) => a.sequence - b.sequence);
                  const loadPorts = sortedPorts.filter(pc => pc.operations?.includes('LOAD'));
                  const dischPorts = sortedPorts.filter(pc => pc.operations?.includes('DISCHARGE')).reverse();
                  const firstLoad = loadPorts[0] ?? null;
                  const lastDisch = dischPorts[0] ?? null;

                  return (
                    <Fragment key={v._id}>
                      <tr
                        className={styles.scheduleRow}
                        onClick={() => toggleRow(v._id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleRow(v._id); }}
                      >
                        <td data-label="Voyage" className={styles.mono}>{v.voyageNumber}</td>
                        <td data-label="Vessel" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
                          {v.vesselName}
                        </td>
                        <td data-label="Departure" className={`${styles.mono} ${styles.colDate}`}>{fmtDate(v.departureDate)}</td>
                        <td data-label="Route">
                          <div className={styles.colRoute}>
                            {firstLoad && (
                              <span className={styles.routePort}>
                                <FlagIcon code={firstLoad.country ?? ''} />
                                {firstLoad.portCode}
                              </span>
                            )}
                            {firstLoad && lastDisch && (
                              <span className={styles.routeArrow}>→</span>
                            )}
                            {lastDisch && (
                              <span className={styles.routePort}>
                                <FlagIcon code={lastDisch.country ?? ''} />
                                {lastDisch.portCode}
                              </span>
                            )}
                            {v.portCalls.length > 2 && (
                              <span className={styles.routeMore}>
                                +{v.portCalls.length - 2} stops
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Status">
                          <span className={styles.badge} style={{ background: vs.bg, color: vs.color }}>
                            {(v.status ?? '').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={styles.colExpand}>
                          <span className={[styles.expandChevron, isExpanded ? styles.expandChevronActive : ''].filter(Boolean).join(' ')}>
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className={styles.expandedRow}>
                          <td colSpan={6} className={styles.expandedCell}>
                            <div className={styles.portTimeline}>
                              {[...v.portCalls]
                                .sort((a, b) => a.sequence - b.sequence)
                                .map((pc, i) => {
                                  const isLoad = pc.operations?.includes('LOAD');
                                  const isDisch = pc.operations?.includes('DISCHARGE');
                                  const effectiveDate = pc.etd ?? pc.eta ?? null;
                                  return (
                                    <div key={`${pc.portCode}-${i}`} className={styles.timelineStop}>
                                      {i > 0 && <div className={styles.timelineConnector} />}
                                      <div className={[
                                        styles.timelineDotSch,
                                        isLoad  ? styles.timelineDotSchLoad  : '',
                                        isDisch ? styles.timelineDotSchDisch : '',
                                      ].filter(Boolean).join(' ')} />
                                      <div className={styles.timelineInfo}>
                                        <div className={styles.timelinePortCode}>
                                          <FlagIcon code={pc.country ?? ''} />
                                          {pc.portCode}
                                        </div>
                                        {pc.portName && (
                                          <div className={styles.timelinePortName}>
                                            {pc.portName}
                                          </div>
                                        )}
                                        {effectiveDate && (
                                          <div className={styles.timelineDate}>
                                            {fmtDate(effectiveDate)}
                                          </div>
                                        )}
                                        <div className={[
                                          styles.timelineOp,
                                          isLoad ? styles.timelineOpLoad : styles.timelineOpDisch,
                                        ].join(' ')}>
                                          {isLoad ? '▲ Load' : '▼ Discharge'}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
