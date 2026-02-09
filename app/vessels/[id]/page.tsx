import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import { mockVessels } from '@/lib/mock-data';
import { voyageTempAssignments } from '@/lib/vessel-profile-data';
import Link from 'next/link';
import styles from './page.module.css';

export default function VesselDetailPage() {
  const vessel = mockVessels[0]; // ACONCAGUA BAY

  // Aggregate zone stats from assignments
  const zoneStats = getZoneStats();
  const totalLoaded = voyageTempAssignments.reduce((s, a) => s + a.palletsLoaded, 0);
  const totalCapacity = voyageTempAssignments.reduce((s, a) => s + a.palletsCapacity, 0);

  return (
    <AppShell activeVessel="ACONCAGUA BAY" activeVoyage="ACON-062026">
      <div className={styles.page}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.vesselNameRow}>
              <h1 className={styles.pageTitle}>{vessel.name}</h1>
              <span className={styles.imo}>IMO {vessel.imoNumber}</span>
            </div>
            <p className={styles.pageSubtitle}>
              {vessel.flag} · {vessel.holds} holds · {vessel.compartments} compartments · {vessel.totalPallets.toLocaleString()} pallets
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary}>Edit Vessel</button>
            <Link href="/stowage-plans/test-123">
              <button className={styles.btnPrimary}>Open Stowage Plan</button>
            </Link>
          </div>
        </div>

        {/* Vessel profile SVG */}
        <VesselProfile />

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Loaded</span>
            <span className={styles.statValue}>{totalLoaded.toLocaleString()} plt</span>
            <span className={styles.statSub}>of {totalCapacity.toLocaleString()} capacity</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Utilization</span>
            <span className={styles.statValue}>{Math.round((totalLoaded / totalCapacity) * 100)}%</span>
            <div className={styles.statBar}>
              <div
                className={styles.statBarFill}
                style={{ width: `${Math.round((totalLoaded / totalCapacity) * 100)}%` }}
              />
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Zones</span>
            <span className={styles.statValue}>{zoneStats.filter((z) => z.cargoType).length} / 8</span>
            <span className={styles.statSub}>temperature zones configured</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Remaining</span>
            <span className={styles.statValue}>{(totalCapacity - totalLoaded).toLocaleString()} plt</span>
            <span className={styles.statSub}>available for loading</span>
          </div>
        </div>

        {/* Zone details table */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Temperature Zones — ACON-062026</h2>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Compartments</th>
                  <th>Temp</th>
                  <th>Cargo</th>
                  <th>Loaded</th>
                  <th>Capacity</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {zoneStats.map((z) => {
                  const pct = z.capacity > 0 ? Math.round((z.loaded / z.capacity) * 100) : 0;
                  return (
                    <tr key={z.zoneId}>
                      <td>
                        <div className={styles.zoneCell}>
                          <span className={styles.zoneDot} style={{ background: z.color }} />
                          <span className={styles.zoneName}>{z.name}</span>
                        </div>
                      </td>
                      <td className={styles.cellMono}>{z.compartments.join(', ')}</td>
                      <td className={styles.cellTemp}>
                        {z.temp !== 0
                          ? <span>{z.temp > 0 ? '+' : ''}{z.temp}°C</span>
                          : <span className={styles.cellMuted}>—</span>
                        }
                      </td>
                      <td>
                        {z.cargoType ? (
                          z.cargoType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                        ) : (
                          <span className={styles.cellMuted}>Not assigned</span>
                        )}
                      </td>
                      <td className={styles.cellRight}>{z.loaded.toLocaleString()}</td>
                      <td className={styles.cellRight}>{z.capacity.toLocaleString()}</td>
                      <td>
                        <div className={styles.utilBar}>
                          <div className={styles.utilTrack}>
                            <div
                              className={styles.utilFill}
                              style={{
                                width: `${pct}%`,
                                background: z.color,
                              }}
                            />
                          </div>
                          <span className={styles.utilLabel}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// --- Zone stats aggregation ---

function getZoneStats() {
  const zoneMap = new Map<string, {
    zoneId: string;
    name: string;
    color: string;
    temp: number;
    cargoType: string;
    loaded: number;
    capacity: number;
    compartments: string[];
  }>();

  for (const a of voyageTempAssignments) {
    const existing = zoneMap.get(a.zoneId);
    if (existing) {
      existing.loaded += a.palletsLoaded;
      existing.capacity += a.palletsCapacity;
      existing.compartments.push(a.compartmentId);
    } else {
      zoneMap.set(a.zoneId, {
        zoneId: a.zoneId,
        name: a.zoneName,
        color: a.zoneColor,
        temp: a.setTemperature,
        cargoType: a.cargoType,
        loaded: a.palletsLoaded,
        capacity: a.palletsCapacity,
        compartments: [a.compartmentId],
      });
    }
  }

  return Array.from(zoneMap.values());
}
