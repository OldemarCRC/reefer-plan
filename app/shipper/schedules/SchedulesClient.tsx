'use client';

import { useState } from 'react';
import { FlagIcon } from '@/lib/utils/flagIcon';
import VoyageActionModal, { type VoyageInfo } from '../VoyageActionModal';
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
  const [selectedVoyage, setSelectedVoyage] = useState<VoyageInfo | null>(null);

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
                  <th>Departure</th>
                  <th>Port Rotation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {svc.voyages.map((v) => {
                  const vs = VOYAGE_STATUS_COLORS[v.status ?? ''] ?? VOYAGE_STATUS_COLORS.PLANNED;
                  const ports = [...v.portCalls].sort((a, b) => a.sequence - b.sequence);
                  return (
                    <tr
                      key={v._id}
                      className={styles.tableRowClickable}
                      onClick={() => setSelectedVoyage(v)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedVoyage(v); }}
                    >
                      <td data-label="Voyage" className={styles.mono}>{v.voyageNumber}</td>
                      <td data-label="Vessel" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' }}>
                        {v.vesselName}
                      </td>
                      <td data-label="Departure" className={styles.mono}>{fmtDate(v.departureDate)}</td>
                      <td data-label="Port Rotation">
                        <div className={styles.portChain}>
                          {ports.map((pc, i) => (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                <FlagIcon code={pc.country ?? ''} /> {pc.portCode}
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
                      <td data-label="Status">
                        <span className={styles.badge} style={{ background: vs.bg, color: vs.color }}>
                          {(v.status ?? '').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {selectedVoyage && (
        <VoyageActionModal
          voyage={selectedVoyage}
          onClose={() => setSelectedVoyage(null)}
        />
      )}
    </>
  );
}
