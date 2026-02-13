import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import VoyageSelector from './VoyageSelector';
import ConfigureZonesButton from './ConfigureZonesButton';
import { getVesselById } from '@/app/actions/vessel';
import { getVoyagesByVessel } from '@/app/actions/voyage';
import { getStowagePlansByVoyage } from '@/app/actions/stowage-plan';
import { buildVesselLayout, type VoyageTempAssignment, type VesselLayout } from '@/lib/vessel-profile-data';
import type { ZoneConfig } from '@/components/vessel/ConfigureZonesModal';
import Link from 'next/link';
import styles from './page.module.css';

// Colors cycled across temperature zones (index = zone order in vessel.temperatureZones)
const ZONE_COLORS = [
  '#3B82F6', '#06B6D4', '#8B5CF6', '#EC4899',
  '#10B981', '#14B8A6', '#F59E0B', '#EF4444',
  '#6366F1', '#F97316', '#84CC16', '#A78BFA',
];

// Build a zone-lookup map from vessel.temperatureZones
// Returns: sectionId → { zoneId, zoneName, zoneColor, palletsCapacity }
function buildZoneMap(temperatureZones: any[]): Map<string, {
  zoneId: string; zoneName: string; zoneColor: string; palletsCapacity: number;
}> {
  const map = new Map<string, { zoneId: string; zoneName: string; zoneColor: string; palletsCapacity: number }>();
  temperatureZones.forEach((zone, zi) => {
    const color = ZONE_COLORS[zi % ZONE_COLORS.length];
    // Build a human-readable zone name from the coolingSectionIds
    const levels = zone.coolingSections.map((s: any) => s.sectionId.slice(1)).join('|');
    const holdNum = zone.coolingSections[0]?.sectionId[0] ?? '?';
    const zoneName = `Hold ${holdNum} ${levels}`;
    for (const section of zone.coolingSections) {
      const pallets = Math.round(section.sqm * (section.designStowageFactor ?? 1.32));
      map.set(section.sectionId, {
        zoneId: zone.zoneId,
        zoneName,
        zoneColor: color,
        palletsCapacity: pallets,
      });
    }
  });
  return map;
}

// Empty assignments for vessel structure display when no voyage/plan is selected.
// Renders all compartments with correct layout but zero cargo and no temperature color.
function buildEmptyAssignments(temperatureZones: any[]): VoyageTempAssignment[] {
  const zoneMap = buildZoneMap(temperatureZones);
  const assignments: VoyageTempAssignment[] = [];
  for (const [sectionId, info] of zoneMap) {
    assignments.push({
      compartmentId: sectionId,
      zoneId: info.zoneId,
      zoneName: info.zoneName,
      zoneColor: info.zoneColor,
      setTemperature: 0,
      cargoType: '',
      palletsLoaded: 0,
      palletsCapacity: info.palletsCapacity,
      shipments: [],
    });
  }
  return assignments;
}

// Map stowage plan cooling section temperatures + cargoPositions → VoyageTempAssignment[]
function buildTempAssignments(plan: any, temperatureZones: any[]): VoyageTempAssignment[] {
  const zoneMap = buildZoneMap(temperatureZones);

  // Build a map of compartmentId → temperature from plan's cooling section status
  const tempByCompartment = new Map<string, number>();
  if (plan.coolingSectionStatus) {
    for (const section of plan.coolingSectionStatus) {
      const temp = section.assignedTemperature ?? 0;
      for (const compId of section.coolingSectionIds) {
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

  // Build assignments for every section in the vessel
  const assignments: VoyageTempAssignment[] = [];
  for (const [sectionId, info] of zoneMap) {
    const cargo = cargoByCompartment.get(sectionId);
    const temp = tempByCompartment.get(sectionId) ?? 0;
    assignments.push({
      compartmentId: sectionId,
      zoneId: info.zoneId,
      zoneName: info.zoneName,
      zoneColor: info.zoneColor,
      setTemperature: temp,
      cargoType: cargo?.cargoType || '',
      palletsLoaded: cargo?.palletsLoaded || 0,
      palletsCapacity: info.palletsCapacity,
      shipments: cargo?.shipments || [],
    });
  }
  return assignments;
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
      // Promote cargoType from the first compartment in this zone that has cargo
      if (!existing.cargoType && a.cargoType) {
        existing.cargoType = a.cargoType;
      }
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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ voyageId?: string }>;
}) {
  const { id } = await params;
  const { voyageId: selectedVoyageId } = await searchParams;

  // Fetch vessel
  const vessel = await getVesselById(id).catch(() => null);

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
  let assignments: VoyageTempAssignment[] = [];
  let selectedPlan: any = null;

  const temperatureZones = (vessel as any).temperatureZones ?? [];

  if (selectedVoyageId) {
    const plansResult = await getStowagePlansByVoyage(selectedVoyageId);
    if (plansResult.success && plansResult.data.length > 0) {
      selectedPlan = plansResult.data[0]; // Use most recent plan
      assignments = buildTempAssignments(selectedPlan, temperatureZones);
    }
    // else: voyage selected but no plan — assignments stays []
  }

  // Build vessel layout for data-driven SVG rendering
  const vesselLayout: VesselLayout = buildVesselLayout(temperatureZones);

  // When no plan data is available, show the vessel's own compartment structure
  // (correct layout, zero cargo, no temperature colors) instead of falling back
  // to the hardcoded ACON-062026 mock data inside VesselProfile.
  const profileAssignments = assignments.length > 0 ? assignments : buildEmptyAssignments(temperatureZones);

  // Compute stats — use profileAssignments for capacity so the vessel's total
  // capacity is always displayed, even when no voyage/plan is selected.
  const totalLoaded = profileAssignments.reduce((s, a) => s + a.palletsLoaded, 0);
  const totalCapacity = profileAssignments.reduce((s, a) => s + a.palletsCapacity, 0);
  const zoneStats = getZoneStats(profileAssignments);

  // Build zone configs for the Configure Zones modal
  // Aggregates cargo info per zone from profileAssignments (cargoType + palletsLoaded)
  const zoneConfigs: ZoneConfig[] = zoneStats.map((z) => {
    const coolSection = selectedPlan?.coolingSectionStatus?.find(
      (cs: any) => cs.zoneId === z.zoneId
    );
    return {
      zoneId: z.zoneId,
      zoneName: z.name,
      coolingSectionIds: coolSection?.coolingSectionIds ?? z.compartments,
      currentTemp: z.temp,
      assignedCargoType: z.cargoType || undefined,
      palletsLoaded: z.loaded,
    };
  });

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
              {vessel.flag} · {vesselLayout.holds.length || vessel.holds?.length || 4} holds ·{' '}
              {vesselLayout.holds.reduce((n, h) => n + h.levels.length, 0) || 19} compartments ·{' '}
              {profileAssignments.reduce((n, a) => n + a.palletsCapacity, 0).toLocaleString()} pallets
            </p>
          </div>
          <div className={styles.headerActions}>
            <VoyageSelector
              vesselId={id}
              voyages={voyages.map((v: any) => ({
                _id: v._id,
                voyageNumber: v.voyageNumber,
                status: v.status,
              }))}
              currentVoyageId={selectedVoyageId}
            />
            <ConfigureZonesButton
              planId={selectedPlan?._id?.toString() ?? null}
              hasVoyage={!!selectedVoyageId}
              zones={zoneConfigs}
            />
            {selectedPlan && (
              <Link href={`/stowage-plans/${selectedPlan._id}`}>
                <button className={styles.btnPrimary}>Open Stowage Plan</button>
              </Link>
            )}
          </div>
        </div>

        {/* Vessel profile SVG */}
        {/* Always pass explicit assignments so VesselProfile never falls back to ACON-062026 mock data.
            profileAssignments is either real plan data or an empty-vessel layout for this vessel. */}
        <VesselProfile
          vesselName={vessel.name}
          tempAssignments={profileAssignments}
          vesselLayout={vesselLayout}
        />

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
            <span className={styles.statValue}>{zoneStats.filter((z) => z.cargoType).length} / {zoneStats.length}</span>
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
