// app/stowage-plans/[id]/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import { getStowagePlanById } from '@/app/actions/stowage-plan';
import ConfigureZonesModal, { type ZoneConfig } from '@/components/vessel/ConfigureZonesModal';
import type { VoyageTempAssignment } from '@/lib/vessel-profile-data';
import styles from './page.module.css';

interface CargoAssignment {
  compartmentId: string;
  quantity: number;
}

interface CargoInPlan {
  shipmentId: string;
  shipmentNumber: string;
  cargoType: string;
  totalQuantity: number;
  pol: string;
  pod: string;
  consignee: string;
  assignments: CargoAssignment[];
}

export default function StowagePlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;

  const [activeTab, setActiveTab] = useState<'cargo' | 'stability' | 'validation'>('cargo');
  const [assigningShipment, setAssigningShipment] = useState<CargoInPlan | null>(null);
  const [selectedCompartment, setSelectedCompartment] = useState<string>('');
  const [assignQuantity, setAssignQuantity] = useState<number>(0);
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [confirmedConflicts, setConfirmedConflicts] = useState<Set<string>>(new Set());
  const [showZoneModal, setShowZoneModal] = useState(false);

  // Plan header info — populated from DB on mount
  const [plan, setPlan] = useState({
    _id: planId,
    planNumber: '...',
    voyageNumber: '...',
    vesselName: '...',
    status: 'DRAFT',
  });

  const defaultTempZoneConfig = [
    { sectionId: '1AB',    zoneId: 'ZONE_1AB',    temp: 13, compartments: ['1A', '1B'] },
    { sectionId: '1CD',    zoneId: 'ZONE_1CD',    temp: 13, compartments: ['1C', '1D'] },
    { sectionId: '2UPDAB', zoneId: 'ZONE_2UPDAB', temp: 13, compartments: ['2UPD', '2A', '2B'] },
    { sectionId: '2CD',    zoneId: 'ZONE_2CD',    temp: 13, compartments: ['2C', '2D'] },
    { sectionId: '3UPDAB', zoneId: 'ZONE_3UPDAB', temp: 13, compartments: ['3UPD', '3A', '3B'] },
    { sectionId: '3CD',    zoneId: 'ZONE_3CD',    temp: 13, compartments: ['3C', '3D'] },
    { sectionId: '4UPDAB', zoneId: 'ZONE_4UPDAB', temp: 13, compartments: ['4UPD', '4A', '4B'] },
    { sectionId: '4CD',    zoneId: 'ZONE_4CD',    temp: 13, compartments: ['4C', '4D'] },
  ];

  const [tempZoneConfig, setTempZoneConfig] = useState(defaultTempZoneConfig);

  useEffect(() => {
    getStowagePlanById(planId).then((result) => {
      if (result.success && result.data) {
        const p = result.data;
        setPlan({
          _id: planId,
          planNumber: p.planNumber || `PLAN-${planId.slice(-6)}`,
          voyageNumber: p.voyageId?.voyageNumber || p.voyageNumber || 'N/A',
          vesselName: p.vesselId?.name || p.vesselName || 'Unknown Vessel',
          status: p.status || 'DRAFT',
        });
        // Use real cooling section temperatures from the plan if available
        if (Array.isArray(p.coolingSectionStatus) && p.coolingSectionStatus.length > 0) {
          setTempZoneConfig(
            p.coolingSectionStatus.map((cs: any) => ({
              sectionId: cs.zoneId,
              zoneId: `ZONE_${cs.zoneId}`,
              temp: cs.assignedTemperature ?? 13,
              compartments: cs.coolingSectionIds ?? [],
            }))
          );
        }
      }
    });
  }, [planId]);

  const [shipments, setShipments] = useState<CargoInPlan[]>([]);


  // Required temperature range per cargo type (shared by validation + auto-stow)
  const cargoTempRequirements: Record<string, { min: number; max: number }> = {
    BANANAS:       { min: 12, max: 14 },
    TABLE_GRAPES:  { min: -1, max:  1 },
    AVOCADOS:      { min:  5, max:  8 },
    CITRUS:        { min:  4, max:  8 },
    BERRIES:       { min:  0, max:  2 },
    PINEAPPLES:    { min: 10, max: 13 },
    KIWIS:         { min:  0, max:  2 },
    FROZEN_FISH:   { min: -25, max: -18 },
    OTHER_FROZEN:  { min: -25, max: -15 },
    OTHER_CHILLED: { min:  0, max: 10 },
  };

  // Build compartment → section lookup once
  const compartmentToSection = useMemo(() => {
    const map: Record<string, { sectionId: string; temp: number }> = {};
    for (const zone of tempZoneConfig) {
      for (const compId of zone.compartments) {
        map[compId] = { sectionId: zone.sectionId, temp: zone.temp };
      }
    }
    return map;
  }, [tempZoneConfig]);

  // Compartment capacities (pallets) — from vessel spec
  const compartmentCapacities: Record<string, number> = {
    '1A': 480, '1B': 278, '1C': 191, '1D': 186,
    '2UPD': 143, '2A': 565, '2B': 499, '2C': 485, '2D': 375,
    '3UPD': 136, '3A': 604, '3B': 577, '3C': 608, '3D': 543,
    '4UPD': 136, '4A': 583, '4B': 544, '4C': 502, '4D': 336,
  };

  // Compute validation dynamically from current assignments
  const validation = useMemo(() => {
    const temperatureConflicts: { compartmentId: string; coolingSectionId: string; description: string; affectedShipments: string[]; userConfirmed: boolean }[] = [];
    const overstowViolations: { compartmentId: string; description: string; affectedShipments: string[] }[] = [];
    const capacityViolations: { compartmentId: string; description: string; affectedShipments: string[]; overBy: number }[] = [];

    // Group assignments by compartment
    const byCompartment: Record<string, { shipment: CargoInPlan; quantity: number }[]> = {};
    for (const s of shipments) {
      for (const a of s.assignments) {
        if (!byCompartment[a.compartmentId]) byCompartment[a.compartmentId] = [];
        byCompartment[a.compartmentId].push({ shipment: s, quantity: a.quantity });
      }
    }

    for (const [compId, entries] of Object.entries(byCompartment)) {
      const section = compartmentToSection[compId];
      if (!section) continue;

      // Temperature conflict check
      for (const { shipment, quantity } of entries) {
        const req = cargoTempRequirements[shipment.cargoType];
        if (req && (section.temp < req.min || section.temp > req.max)) {
          const userConfirmed = confirmedConflicts.has(`${shipment.shipmentId}-${compId}`);
          temperatureConflicts.push({
            compartmentId: compId,
            coolingSectionId: section.sectionId,
            description: `${shipment.cargoType.replace('_', ' ')} (${quantity} pallets) requires ${req.min}–${req.max}°C but ${section.sectionId} is set to ${section.temp > 0 ? '+' : ''}${section.temp}°C`,
            affectedShipments: [shipment.shipmentNumber],
            userConfirmed,
          });
        }
      }

      // Overstow: more than one shipment per compartment
      if (entries.length > 1) {
        overstowViolations.push({
          compartmentId: compId,
          description: `${entries.length} shipments share this compartment`,
          affectedShipments: entries.map(e => e.shipment.shipmentNumber),
        });
      }

      // Capacity check
      const cap = compartmentCapacities[compId];
      const used = entries.reduce((sum, e) => sum + e.quantity, 0);
      if (cap && used > cap) {
        capacityViolations.push({
          compartmentId: compId,
          description: `${used} pallets assigned but capacity is ${cap} — over by ${used - cap}`,
          affectedShipments: entries.map(e => e.shipment.shipmentNumber),
          overBy: used - cap,
        });
      }
    }

    return {
      temperatureConflicts,
      overstowViolations,
      capacityViolations,
      weightDistributionWarnings: ['Port list of 0.8° detected - consider redistributing cargo'],
    };
  }, [shipments, compartmentToSection, confirmedConflicts]);

  // Zone colors (hue-based on temperature, matching wizard)
  const tempToColor = (temp: number) => {
    const hue = Math.round(240 - ((temp + 25) / 40) * 240);
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Transform plan data to VesselProfile format
  const vesselProfileData = useMemo(() => {
    const result: VoyageTempAssignment[] = [];

    // Build assignment lookup
    const byCompartment: Record<string, { shipment: CargoInPlan; quantity: number }[]> = {};
    for (const s of shipments) {
      for (const a of s.assignments) {
        if (!byCompartment[a.compartmentId]) byCompartment[a.compartmentId] = [];
        byCompartment[a.compartmentId].push({ shipment: s, quantity: a.quantity });
      }
    }

    for (const zone of tempZoneConfig) {
      const zoneColor = tempToColor(zone.temp);
      for (const compId of zone.compartments) {
        const entries = byCompartment[compId] || [];
        const palletsLoaded = entries.reduce((sum, e) => sum + e.quantity, 0);
        const capacity = compartmentCapacities[compId] || 0;

        // Determine cargo type: use first shipment's type if any, otherwise empty
        const cargoType = entries.length > 0 ? entries[0].shipment.cargoType : '';

        result.push({
          compartmentId: compId,
          zoneId: zone.zoneId,
          zoneName: zone.sectionId,
          zoneColor,
          setTemperature: zone.temp,
          cargoType,
          palletsLoaded,
          palletsCapacity: capacity,
          shipments: entries.map(e => e.shipment.shipmentNumber),
        });
      }
    }

    return result;
  }, [shipments, tempZoneConfig]);

  const stability = {
    displacement: 8450,
    estimatedGM: 2.8,
    estimatedTrim: 0.5,
    estimatedList: 0.8,
    estimatedDrafts: {
      forward: 7.2,
      aft: 7.7,
      mean: 7.45,
    },
    preliminaryCheck: {
      withinReferenceLimits: true,
      warnings: ['Port list detected'],
    },
  };

  const assignedQty = (s: CargoInPlan) => s.assignments.reduce((sum, a) => sum + a.quantity, 0);
  const remainingQty = (s: CargoInPlan) => s.totalQuantity - assignedQty(s);

  // Total pallets already assigned to a compartment across all shipments
  const usedInCompartment = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shipments) {
      for (const a of s.assignments) {
        map[a.compartmentId] = (map[a.compartmentId] ?? 0) + a.quantity;
      }
    }
    return map;
  }, [shipments]);

  const unstowedShipments = shipments.filter(s => remainingQty(s) > 0);
  const stowedShipments = shipments.filter(s => assignedQty(s) > 0);
  const totalPallets = shipments.reduce((sum, s) => sum + s.totalQuantity, 0);
  const stowedPallets = shipments.reduce((sum, s) => sum + assignedQty(s), 0);

  const getCargoTypeColor = (cargoType: string) => {
    const colors: Record<string, string> = {
      BANANAS: '#eab308',
      TABLE_GRAPES: '#8b5cf6',
      AVOCADOS: '#22c55e',
      CITRUS: '#f97316',
      BERRIES: '#ec4899',
      FROZEN_FISH: '#06b6d4',
    };
    return colors[cargoType] || '#64748b';
  };

  const handleConfirmAssign = () => {
    if (!assigningShipment || !selectedCompartment || assignQuantity <= 0) return;

    const section = compartmentToSection[selectedCompartment];
    const req = cargoTempRequirements[assigningShipment.cargoType];
    const hasConflict = req && section && (section.temp < req.min || section.temp > req.max);

    if (hasConflict && !showConflictWarning) {
      setShowConflictWarning(true);
      return;
    }

    if (hasConflict) {
      setConfirmedConflicts(prev => new Set([...prev, `${assigningShipment.shipmentId}-${selectedCompartment}`]));
    }

    setShipments(prev => prev.map(s => {
      if (s.shipmentId !== assigningShipment.shipmentId) return s;
      const existing = s.assignments.find(a => a.compartmentId === selectedCompartment);
      const updatedAssignments = existing
        ? s.assignments.map(a => a.compartmentId === selectedCompartment
            ? { ...a, quantity: a.quantity + assignQuantity }
            : a)
        : [...s.assignments, { compartmentId: selectedCompartment, quantity: assignQuantity }];
      return { ...s, assignments: updatedAssignments };
    }));
    setAssigningShipment(null);
    setSelectedCompartment('');
    setAssignQuantity(0);
    setShowConflictWarning(false);
  };

  const handleCancelAssign = () => {
    setAssigningShipment(null);
    setSelectedCompartment('');
    setAssignQuantity(0);
    setShowConflictWarning(false);
  };

  const handleRemoveAssignment = (shipmentId: string, compartmentId: string) => {
    setShipments(prev => prev.map(s =>
      s.shipmentId === shipmentId
        ? { ...s, assignments: s.assignments.filter(a => a.compartmentId !== compartmentId) }
        : s
    ));
  };

  const handleAutoStow = () => {
    setShipments(prev => {
      const updated = prev.map(s => ({ ...s, assignments: [...s.assignments] }));
      // Track pallet counts per compartment to avoid over-filling
      const usedCompartments = new Set(updated.flatMap(s => s.assignments.map(a => a.compartmentId)));

      for (const shipment of updated) {
        const rem = remainingQty(shipment);
        if (rem <= 0) continue;

        const req = cargoTempRequirements[shipment.cargoType];
        if (!req) continue;

        for (const zone of tempZoneConfig) {
          if (zone.temp < req.min || zone.temp > req.max) continue;

          const freeCompartment = zone.compartments.find(c => !usedCompartments.has(c));
          if (!freeCompartment) continue;

          shipment.assignments.push({ compartmentId: freeCompartment, quantity: rem });
          usedCompartments.add(freeCompartment);
          break;
        }
      }

      return updated;
    });
  };

  const handleSavePlan = () => {
    // TODO: Call Server Action to update plan
    console.log('Saving plan...');
  };

  const handleSendToCaptain = () => {
    // TODO: Generate PDF and send email
    console.log('Sending to captain...');
  };

  return (
    <AppShell activeVessel={plan.vesselName} activeVoyage={plan.voyageNumber}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.breadcrumb}>
              <Link href="/stowage-plans">Stowage Plans</Link>
              <span>/</span>
              <span>{plan.planNumber}</span>
            </div>
            <h1>{plan.planNumber}</h1>
            <div className={styles.meta}>
              <span>{plan.voyageNumber}</span>
              <span>•</span>
              <span>{plan.vesselName}</span>
              <span>•</span>
              <span className={`${styles.statusBadge} ${styles[plan.status.toLowerCase()]}`}>
                {plan.status}
              </span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => setShowZoneModal(true)}>
              Configure Zones
            </button>
            <button className={styles.btnSecondary} onClick={handleSavePlan}>
              Save Draft
            </button>
            <button className={styles.btnPrimary} onClick={handleSendToCaptain}>
              Send to Captain
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Total Cargo</div>
            <div className={styles.statValue}>{totalPallets} pallets</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Stowed</div>
            <div className={styles.statValue}>
              {stowedPallets} <span className={styles.statSubtext}>/ {totalPallets}</span>
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Utilization</div>
            <div className={styles.statValue}>
              {Math.round((stowedPallets / 4840) * 100)}%
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>GM</div>
            <div className={styles.statValue}>{stability.estimatedGM}m</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Trim</div>
            <div className={styles.statValue}>{stability.estimatedTrim > 0 ? '+' : ''}{stability.estimatedTrim}m</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Left Panel - Cargo Management */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h2>Cargo Management</h2>
            <button className={styles.btnAuto} onClick={handleAutoStow}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12m4-8l-4-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Auto-Stow
            </button>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'cargo' ? styles.active : ''}`}
              onClick={() => setActiveTab('cargo')}
            >
              Cargo List ({shipments.length})
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'stability' ? styles.active : ''}`}
              onClick={() => setActiveTab('stability')}
            >
              Stability
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'validation' ? styles.active : ''}`}
              onClick={() => setActiveTab('validation')}
            >
              Validation
              {(validation.temperatureConflicts.length + validation.overstowViolations.length + validation.capacityViolations.length) > 0 && (
                <span className={styles.badge}>
                  {validation.temperatureConflicts.length + validation.overstowViolations.length + validation.capacityViolations.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'cargo' && (
              <div className={styles.cargoList}>
                {/* Unstowed Shipments */}
                {unstowedShipments.length > 0 && (
                  <div className={styles.cargoSection}>
                    <h3>Unstowed Cargo ({unstowedShipments.length})</h3>
                    {unstowedShipments.map(shipment => (
                      <div key={shipment.shipmentId} className={styles.cargoCard}>
                        <div className={styles.cargoHeader}>
                          <div
                            className={styles.cargoDot}
                            style={{ backgroundColor: getCargoTypeColor(shipment.cargoType) }}
                          />
                          <span className={styles.cargoType}>
                            {shipment.cargoType.replace('_', ' ')}
                          </span>
                          <span className={styles.shipmentNumber}>{shipment.shipmentNumber}</span>
                        </div>
                        <div className={styles.cargoDetails}>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Assigned:</span>
                            <span className={styles.value}>
                              {assignedQty(shipment)}/{shipment.totalQuantity} pallets
                            </span>
                          </div>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Route:</span>
                            <span className={styles.value}>{shipment.pol} → {shipment.pod}</span>
                          </div>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Consignee:</span>
                            <span className={styles.value}>{shipment.consignee}</span>
                          </div>
                        </div>
                        <button
                          className={styles.btnAssign}
                          onClick={() => {
                            setAssigningShipment(shipment);
                            setSelectedCompartment('');
                            setAssignQuantity(remainingQty(shipment));
                          }}
                        >
                          Assign to Compartment
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Stowed Shipments */}
                {stowedShipments.length > 0 && (
                  <div className={styles.cargoSection}>
                    <h3>Stowed Cargo ({stowedShipments.length})</h3>
                    {stowedShipments.map(shipment => (
                      <div key={shipment.shipmentId} className={`${styles.cargoCard} ${remainingQty(shipment) === 0 ? styles.stowed : styles.partial}`}>
                        <div className={styles.cargoHeader}>
                          <div
                            className={styles.cargoDot}
                            style={{ backgroundColor: getCargoTypeColor(shipment.cargoType) }}
                          />
                          <span className={styles.cargoType}>
                            {shipment.cargoType.replace('_', ' ')}
                          </span>
                          <span className={styles.shipmentNumber}>{shipment.shipmentNumber}</span>
                        </div>
                        <div className={styles.cargoDetails}>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Assigned:</span>
                            <span className={styles.value}>
                              {assignedQty(shipment)}/{shipment.totalQuantity} pallets
                            </span>
                          </div>
                          {shipment.assignments.map(a => (
                            <div key={a.compartmentId} className={styles.assignmentRow}>
                              <span className={styles.compartmentTag}>{a.compartmentId}</span>
                              <span className={styles.assignmentQty}>{a.quantity} pal.</span>
                              <button
                                className={styles.btnRemoveSmall}
                                onClick={() => handleRemoveAssignment(shipment.shipmentId, a.compartmentId)}
                              >✕</button>
                            </div>
                          ))}
                        </div>
                        <button
                          className={styles.btnAssign}
                          onClick={() => {
                            setAssigningShipment(shipment);
                            setSelectedCompartment('');
                            setAssignQuantity(remainingQty(shipment) || 1);
                          }}
                        >
                          + Add Compartment
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stability' && (
              <div className={styles.stabilityPanel}>
                <h3>Preliminary Stability Estimate</h3>
                <div className={styles.stabilityGrid}>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>Displacement:</span>
                    <span className={styles.value}>{stability.displacement} MT</span>
                  </div>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>GM:</span>
                    <span className={styles.value}>{stability.estimatedGM} m</span>
                  </div>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>Trim:</span>
                    <span className={styles.value}>{stability.estimatedTrim} m</span>
                  </div>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>List:</span>
                    <span className={styles.value}>{stability.estimatedList}°</span>
                  </div>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>Draft Forward:</span>
                    <span className={styles.value}>{stability.estimatedDrafts.forward} m</span>
                  </div>
                  <div className={styles.stabilityItem}>
                    <span className={styles.label}>Draft Aft:</span>
                    <span className={styles.value}>{stability.estimatedDrafts.aft} m</span>
                  </div>
                </div>

                {stability.preliminaryCheck.warnings.length > 0 && (
                  <div className={styles.warningBox}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 6v4m0 4h.01M2 10l8-8 8 8-8 8-8-8z" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    <div>
                      <strong>Warnings:</strong>
                      <ul>
                        {stability.preliminaryCheck.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className={styles.disclaimer}>
                  <strong>⚠️ Disclaimer:</strong> This is a preliminary estimate only. 
                  Final stability calculations must be performed by the ship's stability system onboard.
                </div>
              </div>
            )}

            {activeTab === 'validation' && (
              <div className={styles.validationPanel}>
                <h3>Plan Validation</h3>

                {/* Temperature Conflicts */}
                {validation.temperatureConflicts.length > 0 && (
                  <div className={styles.validationSection}>
                    <h4>Temperature Conflicts ({validation.temperatureConflicts.length})</h4>
                    {validation.temperatureConflicts.map((conflict, idx) => (
                      <div key={idx} className={conflict.userConfirmed ? styles.conflictCardWarning : styles.conflictCard}>
                        <div className={styles.conflictHeader}>
                          {conflict.userConfirmed ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5"/>
                              <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                              <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                            </svg>
                          )}
                          <span>{conflict.compartmentId}</span>
                          {conflict.userConfirmed && <span className={styles.confirmedBadge}>user accepted</span>}
                        </div>
                        <p>{conflict.description}</p>
                        <div className={styles.affectedShipments}>
                          Affected: {conflict.affectedShipments.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Overstow Violations */}
                {validation.overstowViolations.length > 0 && (
                  <div className={styles.validationSection}>
                    <h4>Overstow Violations ({validation.overstowViolations.length})</h4>
                    {validation.overstowViolations.map((v, idx) => (
                      <div key={idx} className={styles.conflictCard}>
                        <div className={styles.conflictHeader}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                            <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                          </svg>
                          <span>{v.compartmentId}</span>
                        </div>
                        <p>{v.description}</p>
                        <div className={styles.affectedShipments}>
                          Affected: {v.affectedShipments.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Capacity Violations */}
                {validation.capacityViolations.length > 0 && (
                  <div className={styles.validationSection}>
                    <h4>Capacity Exceeded ({validation.capacityViolations.length})</h4>
                    {validation.capacityViolations.map((v, idx) => (
                      <div key={idx} className={styles.conflictCard}>
                        <div className={styles.conflictHeader}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                            <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                          </svg>
                          <span>{v.compartmentId}</span>
                          <span className={styles.overCapacityBadge}>+{v.overBy} over</span>
                        </div>
                        <p>{v.description}</p>
                        <div className={styles.affectedShipments}>
                          Affected: {v.affectedShipments.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Weight Distribution Warnings */}
                {validation.weightDistributionWarnings.length > 0 && (
                  <div className={styles.validationSection}>
                    <h4>Weight Distribution</h4>
                    {validation.weightDistributionWarnings.map((warning, idx) => (
                      <div key={idx} className={styles.warningCard}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5"/>
                          <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2"/>
                        </svg>
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                {validation.overstowViolations.length === 0 &&
                 validation.temperatureConflicts.length === 0 &&
                 validation.capacityViolations.length === 0 &&
                 validation.weightDistributionWarnings.length === 0 && (
                  <div className={styles.successBox}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                      <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>No validation issues found. Plan is ready for captain review.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Vessel Visualization */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>Vessel Profile</h2>
          </div>
          <VesselProfile
            vesselName={plan.vesselName}
            voyageNumber={plan.voyageNumber}
            tempAssignments={vesselProfileData}
          />

        </div>
      </div>

      {/* Assign to Compartment Modal */}
      {assigningShipment && (
        <div className={styles.modalOverlay} onClick={handleCancelAssign}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Assign {assigningShipment.shipmentNumber}</h3>
              <button className={styles.modalClose} onClick={handleCancelAssign}>✕</button>
            </div>

            <div className={styles.modalMeta}>
              <span
                className={styles.cargoDot}
                style={{ backgroundColor: getCargoTypeColor(assigningShipment.cargoType) }}
              />
              <span>{assigningShipment.cargoType.replace('_', ' ')}</span>
              <span className={styles.separator}>·</span>
              <span>{assignedQty(assigningShipment)}/{assigningShipment.totalQuantity} pallets assigned</span>
              <span className={styles.separator}>·</span>
              <span>{assigningShipment.consignee}</span>
            </div>

            <div className={styles.compartmentList}>
              {tempZoneConfig.map(zone => (
                <div key={zone.sectionId} className={styles.zoneGroup}>
                  <div className={styles.zoneGroupLabel}>
                    {zone.sectionId}
                    <span className={styles.zoneGroupTemp}>
                      {zone.temp > 0 ? '+' : ''}{zone.temp}°C
                    </span>
                  </div>
                  {zone.compartments.map(compId => {
                    const cap = compartmentCapacities[compId] ?? 0;
                    const used = usedInCompartment[compId] ?? 0;
                    const free = cap - used;
                    const isFull = cap > 0 && free <= 0;
                    return (
                      <label
                        key={compId}
                        className={`${styles.compartmentOption} ${selectedCompartment === compId ? styles.selected : ''} ${isFull ? styles.compartmentFull : ''}`}
                      >
                        <input
                          type="radio"
                          name="compartment"
                          value={compId}
                          checked={selectedCompartment === compId}
                          onChange={() => { setSelectedCompartment(compId); setShowConflictWarning(false); }}
                        />
                        <span className={styles.compartmentId}>{compId}</span>
                        {cap > 0 && (
                          <span className={isFull ? styles.capacityFull : styles.capacityFree}>
                            {isFull ? 'full' : `${free} free`}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className={styles.quantityRow}>
              <label className={styles.quantityLabel}>
                Pallets to assign:
              </label>
              <input
                type="number"
                className={styles.quantityInput}
                value={assignQuantity}
                min={1}
                max={remainingQty(assigningShipment)}
                onChange={e => { setAssignQuantity(parseInt(e.target.value) || 0); setShowConflictWarning(false); }}
              />
              <span className={styles.quantityMax}>/ {remainingQty(assigningShipment)} remaining</span>
            </div>

            {showConflictWarning && selectedCompartment && (() => {
              const section = compartmentToSection[selectedCompartment];
              const req = cargoTempRequirements[assigningShipment.cargoType];
              return (
                <div className={styles.conflictWarning}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2l8 16H2l8-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 8v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <strong>Temperature Conflict</strong>
                    <p>
                      {assigningShipment.cargoType.replace('_', ' ')} requires {req?.min}–{req?.max}°C<br />
                      {selectedCompartment} (section {section?.sectionId}) is set to {section?.temp > 0 ? '+' : ''}{section?.temp}°C
                    </p>
                    <p>Assigning here may damage the product.</p>
                  </div>
                </div>
              );
            })()}

            {selectedCompartment && assignQuantity > 0 && (() => {
              const cap = compartmentCapacities[selectedCompartment];
              const used = usedInCompartment[selectedCompartment] ?? 0;
              if (!cap) return null;
              const wouldUse = used + assignQuantity;
              if (wouldUse <= cap) return null;
              return (
                <div className={styles.capacityWarning}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2l8 16H2l8-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 8v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <strong>Capacity Warning</strong>
                    <p>
                      {selectedCompartment} holds {cap} pallets max. Already used: {used}.<br />
                      Assigning {assignQuantity} would exceed capacity by <strong>{wouldUse - cap} pallets</strong>.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={handleCancelAssign}>
                Cancel
              </button>
              <button
                className={showConflictWarning ? styles.btnWarning : styles.btnPrimary}
                disabled={!selectedCompartment || assignQuantity <= 0}
                onClick={handleConfirmAssign}
              >
                {showConflictWarning ? 'Assign Anyway' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Configure Zones Modal */}
      {showZoneModal && (() => {
        // Build cargo summary per zone from current shipment assignments
        const cargoByZone: Record<string, { cargoType: string; palletsLoaded: number }> = {};
        for (const zone of tempZoneConfig) {
          let totalPalletsInZone = 0;
          let dominantCargo = '';
          for (const s of shipments) {
            for (const a of s.assignments) {
              if (zone.compartments.includes(a.compartmentId)) {
                totalPalletsInZone += a.quantity;
                if (!dominantCargo) dominantCargo = s.cargoType;
              }
            }
          }
          cargoByZone[zone.sectionId] = { cargoType: dominantCargo, palletsLoaded: totalPalletsInZone };
        }

        const zoneConfigs: ZoneConfig[] = tempZoneConfig.map((zone) => ({
          zoneId: zone.sectionId,
          zoneName: zone.sectionId.replace(/(\d+)(UPD)?([A-Z]+)/, (_, hold, upd, levels) =>
            `Hold ${hold}${upd ? ' UPD|' : ' '}${levels.split('').join('|')}`
          ),
          coolingSectionIds: zone.compartments,
          currentTemp: zone.temp,
          assignedCargoType: cargoByZone[zone.sectionId]?.cargoType || undefined,
          palletsLoaded: cargoByZone[zone.sectionId]?.palletsLoaded ?? 0,
        }));

        return (
          <ConfigureZonesModal
            planId={planId}
            zones={zoneConfigs}
            isOpen={showZoneModal}
            onClose={() => setShowZoneModal(false)}
            onSuccess={(updatedSections) => {
              // Update tempZoneConfig directly from the server response
              if (Array.isArray(updatedSections) && updatedSections.length > 0) {
                setTempZoneConfig(
                  updatedSections.map((cs: any) => ({
                    sectionId: cs.zoneId,
                    zoneId: `ZONE_${cs.zoneId}`,
                    temp: cs.assignedTemperature ?? 13,
                    compartments: cs.coolingSectionIds ?? [],
                  }))
                );
              }
              setShowZoneModal(false);
            }}
          />
        );
      })()}
      </div>
    </AppShell>
  );
}