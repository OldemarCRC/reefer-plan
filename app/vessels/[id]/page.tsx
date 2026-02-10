import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import VoyageSelector from './VoyageSelector';
import { getVesselById } from '@/app/actions/vessel';
import { getVoyagesByVessel } from '@/app/actions/voyage';
import { getStowagePlansByVoyage } from '@/app/actions/stowage-plan';
import type { VoyageTempAssignment } from '@/lib/vessel-profile-data';
import { compartmentLayouts } from '@/lib/vessel-profile-data';
import Link from 'next/link';
import styles from './page.module.css';

// Static zone mapping derived from compartment ID prefix
// Mirrors the cooling section groupings for ACONCAGUA BAY
const COMPARTMENT_ZONE_MAP: Record<string, { zoneId: string; zoneName: string; zoneColor: string }> = {
  '1A':   { zoneId: 'ZONE_1AB',    zoneName: 'Hold 1 A|B',       zoneColor: '#3B82F6' },
  '1B':   { zoneId: 'ZONE_1AB',    zoneName: 'Hold 1 A|B',       zoneColor: '#3B82F6' },
  '1C':   { zoneId: 'ZONE_1CD',    zoneName: 'Hold 1 C|D',       zoneColor: '#06B6D4' },
  '1D':   { zoneId: 'ZONE_1CD',    zoneName: 'Hold 1 C|D',       zoneColor: '#06B6D4' },
  '2UPD': { zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B',  zoneColor: '#8B5CF6' },
  '2A':   { zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B',  zoneColor: '#8B5CF6' },
  '2B':   { zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B',  zoneColor: '#8B5CF6' },
  '2C':   { zoneId: 'ZONE_2CD',    zoneName: 'Hold 2 C|D',       zoneColor: '#EC4899' },
  '2D':   { zoneId: 'ZONE_2CD',    zoneName: 'Hold 2 C|D',       zoneColor: '#EC4899' },
  '3UPD': { zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B',  zoneColor: '#10B981' },
  '3A':   { zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B',  zoneColor: '#10B981' },
  '3B':   { zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B',  zoneColor: '#10B981' },
  '3C':   { zoneId: 'ZONE_3CD',    zoneName: 'Hold 3 C|D',       zoneColor: '#14B8A6' },
  '3D':   { zoneId: 'ZONE_3CD',    zoneName: 'Hold 3 C|D',       zoneColor: '#14B8A6' },
  '4UPD': { zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B',  zoneColor: '#F59E0B' },
  '4A':   { zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B',  zoneColor: '#F59E0B' },
  '4B':   { zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B',  zoneColor: '#F59E0B' },
  '4C':   { zoneId: 'ZONE_4CD',    zoneName: 'Hold 4 C|D',       zoneColor: '#EF4444' },
  '4D':   { zoneId: 'ZONE_4CD',    zoneName: 'Hold 4 C|D',       zoneColor: '#EF4444' },
};

// Map stowage plan cooling section temperatures + cargoPositions → VoyageTempAssignment[]
function buildTempAssignments(plan: any): VoyageTempAssignment[] {
  // Build a map of compartmentId → temperature from cooling section status
  const tempByCompartment = new Map<string, number>();
  if (plan.coolingSectionStatus) {
    for (const section of plan.coolingSectionStatus) {
      const temp = section.assignedTemperature ?? 0;
      for (const compId of section.compartmentIds) {
        tempByCompartment.set(compId, temp);
      }
    }
  }

  // Build a map of compartmentId → { cargo, pallets } from cargoPositions
  const cargoByCompartment = new Map<string, { cargoType: string; palletsLoaded: number; shipments: string[] }>();
  if (plan.cargoPositions) {
    for (const pos of plan.cargoPositions) {
      const compId = pos.compartment?.id;
      if (!compId) continue;
      const existing = cargoByCompartment.get(compId);
      if (existing) {
        existing.palletsLoaded += pos.quantity || 0;
        if (pos.bookingId) existing.shipments.push(pos.bookingId);
      } else {
        cargoByCompartment.set(compId, {
          cargoType: pos.cargoType || 'UNKNOWN',
          palletsLoaded: pos.quantity || 0,
          shipments: pos.bookingId ? [pos.bookingId] : [],
        });
      }
    }
  }

  // Build assignments for every known compartment
  return compartmentLayouts.map((layout) => {
    const zone = COMPARTMENT_ZONE_MAP[layout.id] || {
      zoneId: 'ZONE_UNKNOWN',
      zoneName: 'Unknown',
      zoneColor: '#6B7280',
    };
    const cargo = cargoByCompartment.get(layout.id);
    const temp = tempByCompartment.get(layout.id) ?? 0;

    return {
      compartmentId: layout.id,
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      zoneColor: zone.zoneColor,
      setTemperature: temp,
      cargoType: cargo?.cargoType || '',
      palletsLoaded: cargo?.palletsLoaded || 0,
      palletsCapacity: layout.pallets,
      shipments: cargo?.shipments || [],
    };
  });
}

function getZoneStats(assignments: VoyageTempAssignment[]) {
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

  for (const a of assignments) {
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

export default async function VesselDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { voyageId?: string };
}) {
  // Fetch vessel
  const vessel = await getVesselById(params.id).catch(() => null);

  if (!vessel) {
    return (
      <AppShell>
        <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
          Vessel not found.
        </div>
      </AppShell>
    );
  }

  // Fetch voyages for this vessel
  const voyagesResult = await getVoyagesByVessel(vessel._id);
  const voyages = voyagesResult.success ? voyagesResult.data : [];

  // If a voyageId is selected, fetch its stowage plan
  const selectedVoyageId = searchParams.voyageId;
  let assignments: VoyageTempAssignment[] = [];
  let selectedPlan: any = null;

  if (selectedVoyageId) {
    const plansResult = await getStowagePlansByVoyage(selectedVoyageId);
    if (plansResult.success && plansResult.data.length > 0) {
      selectedPlan = plansResult.data[0]; // Use most recent plan
      assignments = buildTempAssignments(selectedPlan);
    } else {
      // Voyage selected but no plan yet — show empty vessel
      assignments = [];
    }
  }

  // Compute stats
  const totalLoaded = assignments.reduce((s, a) => s + a.palletsLoaded, 0);
  const totalCapacity = assignments.reduce((s, a) => s + a.palletsCapacity, 0);
  const zoneStats = getZoneStats(assignments);

  // Selected voyage label for the table header
  const selectedVoyage = voyages.find((v: any) => v._id === selectedVoyageId);
  const voyageLabel = selectedVoyage?.voyageNumber || null;

  return (
    <AppShell activeVessel={vessel.name}>
      <div className={styles.page}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.vesselNameRow}>
              <h1 className={styles.pageTitle}>{vessel.name}</h1>
              <span className={styles.imo}>IMO {vessel.imoNumber}</span>
            </div>
            <p className={styles.pageSubtitle}>
              {vessel.flag} · {vessel.holds?.length ?? 4} holds ·{' '}
              {vessel.holds?.reduce((n, h) => n + (h.compartments?.length ?? 0), 0) ?? 18} compartments ·{' '}
              {compartmentLayouts.reduce((n, c) => n + c.pallets, 0).toLocaleString()} pallets
            </p>
          </div>
          <div className={styles.headerActions}>
            <VoyageSelector
              vesselId={params.id}
              voyages={voyages.map((v: any) => ({
                _id: v._id,
                voyageNumber: v.voyageNumber,
                status: v.status,
              }))}
              currentVoyageId={selectedVoyageId}
            />
            <button className={styles.btnSecondary}>Edit Vessel</button>
            {selectedPlan && (
              <Link href={`/stowage-plans/${selectedPlan._id}`}>
                <button className={styles.btnPrimary}>Open Stowage Plan</button>
              </Link>
            )}
          </div>
        </div>

        {/* Vessel profile SVG */}
        {/* No voyage selected → undefined falls back to mock demo data */}
        {/* Voyage selected → pass real assignments (may be [] if no plan exists) */}
        <VesselProfile tempAssignments={selectedVoyageId ? assignments : undefined} />

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Loaded</span>
            <span className={styles.statValue}>{totalLoaded.toLocaleString()} plt</span>
            <span className={styles.statSub}>of {totalCapacity.toLocaleString()} capacity</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Utilization</span>
            <span className={styles.statValue}>
              {totalCapacity > 0 ? Math.round((totalLoaded / totalCapacity) * 100) : 0}%
            </span>
            <div className={styles.statBar}>
              <div
                className={styles.statBarFill}
                style={{
                  width: `${totalCapacity > 0 ? Math.round((totalLoaded / totalCapacity) * 100) : 0}%`,
                }}
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
            <h2 className={styles.cardTitle}>
              Temperature Zones{voyageLabel ? ` — ${voyageLabel}` : ''}
            </h2>
          </div>
          {assignments.length === 0 ? (
            <p className={styles.cellMuted} style={{ padding: 'var(--space-4) 0' }}>
              {selectedVoyageId
                ? 'No stowage plan found for this voyage.'
                : 'Select a voyage above to view temperature zone data.'}
            </p>
          ) : (
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
                          {z.temp !== 0 ? (
                            <span>{z.temp > 0 ? '+' : ''}{z.temp}°C</span>
                          ) : (
                            <span className={styles.cellMuted}>—</span>
                          )}
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
                                style={{ width: `${pct}%`, background: z.color }}
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
          )}
        </div>
      </div>
    </AppShell>
  );
}
