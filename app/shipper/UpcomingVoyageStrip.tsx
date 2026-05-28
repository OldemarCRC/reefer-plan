'use client';

import { useState } from 'react';
import { FlagIcon } from '@/lib/utils/flagIcon';
import VoyageActionModal, { type VoyageInfo } from './VoyageActionModal';
import styles from './shipper.module.css';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function UpcomingVoyageStrip({ voyages }: { voyages: VoyageInfo[] }) {
  const [selectedVoyage, setSelectedVoyage] = useState<VoyageInfo | null>(null);

  return (
    <>
      <div className={styles.voyageStrip}>
        {voyages.map((v) => {
          const loadPorts = v.portCalls.filter((pc) => pc.operations?.includes('LOAD'));
          const dischPorts = v.portCalls.filter((pc) => pc.operations?.includes('DISCHARGE'));
          return (
            <div
              key={v._id}
              className={`${styles.voyageCard} ${styles.voyageCardClickable}`}
              onClick={() => setSelectedVoyage(v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedVoyage(v); }}
            >
              <div className={styles.voyageCardNum}>{v.voyageNumber}</div>
              <div className={styles.voyageCardVessel}>{v.vesselName}</div>
              <div className={styles.voyageCardDep}>Dep. {fmtDate(v.departureDate)}</div>
              <div className={styles.portChain}>
                {loadPorts.map((pc, i) => (
                  <span key={i} className={`${styles.portDot} ${styles['portDot--load']}`}>
                    <FlagIcon code={pc.country ?? ''} /> {pc.portCode}
                    {i < loadPorts.length - 1 && <span className={styles.portDotSep} />}
                  </span>
                ))}
                {dischPorts.length > 0 && <span className={`${styles.portDot} ${styles.portArrow}`}> → </span>}
                {dischPorts.map((pc, i) => (
                  <span key={i} className={`${styles.portDot} ${styles['portDot--discharge']}`}>
                    <FlagIcon code={pc.country ?? ''} /> {pc.portCode}
                    {i < dischPorts.length - 1 && <span className={styles.portDotSep} />}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedVoyage && (
        <VoyageActionModal
          voyage={selectedVoyage}
          onClose={() => setSelectedVoyage(null)}
        />
      )}
    </>
  );
}
