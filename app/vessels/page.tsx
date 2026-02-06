import AppShell from '@/components/layout/AppShell';
import { mockVessels } from '@/lib/mock-data';
import styles from './page.module.css';

export default function VesselsPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Vessels</h1>
            <p className={styles.pageSubtitle}>{mockVessels.length} vessels in fleet</p>
          </div>
          <button className={styles.btnPrimary}>+ Add Vessel</button>
        </div>

        {/* Vessel grid */}
        <div className={styles.vesselGrid}>
          {mockVessels.map((v) => (
            <div key={v._id} className={styles.vesselCard}>
              {/* Ship icon header */}
              <div className={styles.cardTop}>
                <div className={styles.shipIcon}>
                  <svg viewBox="0 0 48 32" fill="none">
                    <path
                      d="M4 24l4-8h32l4 8"
                      stroke="var(--color-cyan)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                    />
                    <path
                      d="M10 16V10a2 2 0 012-2h24a2 2 0 012 2v6"
                      stroke="var(--color-blue)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <line x1="24" y1="8" x2="24" y2="4" stroke="var(--color-blue)" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M2 26c3 0 4-1 6-1s3 1 6 1 4-1 6-1 3 1 6 1 4-1 6-1 3 1 6 1 4-1 6-1"
                      stroke="var(--color-cyan)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      opacity="0.4"
                    />
                  </svg>
                </div>
                <div className={styles.vesselName}>{v.name}</div>
                <div className={styles.vesselImo}>IMO {v.imoNumber}</div>
                {v.currentVoyage && (
                  <div className={styles.activeVoyage}>
                    <span className={styles.activeDot} />
                    {v.currentVoyage}
                  </div>
                )}
              </div>

              {/* Specs grid */}
              <div className={styles.specsGrid}>
                <div className={styles.specItem}>
                  <span className={styles.specValue}>{v.totalPallets.toLocaleString()}</span>
                  <span className={styles.specLabel}>Pallets</span>
                </div>
                <div className={styles.specItem}>
                  <span className={styles.specValue}>{v.holds}</span>
                  <span className={styles.specLabel}>Holds</span>
                </div>
                <div className={styles.specItem}>
                  <span className={styles.specValue}>{v.compartments}</span>
                  <span className={styles.specLabel}>Compartments</span>
                </div>
                <div className={styles.specItem}>
                  <span className={styles.specValue}>{v.temperatureZones}</span>
                  <span className={styles.specLabel}>Temp Zones</span>
                </div>
              </div>

              {/* Temperature range indicator */}
              <div className={styles.tempRange}>
                <div className={styles.tempRangeBar}>
                  <div className={styles.tempFrozen} />
                  <div className={styles.tempChilled} />
                  <div className={styles.tempBanana} />
                </div>
                <div className={styles.tempLabels}>
                  <span>-25°C</span>
                  <span>0°C</span>
                  <span>+15°C</span>
                </div>
              </div>

              {/* Footer */}
              <div className={styles.cardFooter}>
                <span className={styles.flag}>{v.flag}</span>
                <button className={styles.btnGhost}>View Profile →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
