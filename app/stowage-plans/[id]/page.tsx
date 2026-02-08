// app/stowage-plans/[id]/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import VesselProfile from '@/components/vessel/VesselProfile';
import styles from './page.module.css';

interface CargoInPlan {
  shipmentId: string;
  shipmentNumber: string;
  cargoType: string;
  quantity: number;
  pol: string;
  pod: string;
  compartmentId: string | null;
  consignee: string;
}

export default function StowagePlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;

  const [activeTab, setActiveTab] = useState<'cargo' | 'stability' | 'validation'>('cargo');
  const [assigningShipment, setAssigningShipment] = useState<CargoInPlan | null>(null);
  const [selectedCompartment, setSelectedCompartment] = useState<string>('');

  // Mock data - replace with actual data fetching
  const plan = {
    _id: planId,
    planNumber: 'PLAN-2026-001',
    voyageNumber: 'ACON-062026',
    vesselName: 'ACONCAGUA BAY',
    status: 'DRAFT',
    createdAt: '2026-02-07T10:30:00Z',
    cargoPositions: [
      {
        shipmentId: '1',
        compartmentId: 'H2-A',
        weight: 18000,
      },
      {
        shipmentId: '2',
        compartmentId: 'H3-B',
        weight: 15000,
      },
    ],
  };

  const [shipments, setShipments] = useState<CargoInPlan[]>([
    {
      shipmentId: '1',
      shipmentNumber: 'SHP-001',
      cargoType: 'BANANAS',
      quantity: 900,
      pol: 'CLVAP',
      pod: 'NLRTM',
      compartmentId: 'H2-A',
      consignee: 'FYFFES',
    },
    {
      shipmentId: '2',
      shipmentNumber: 'SHP-002',
      cargoType: 'BANANAS',
      quantity: 750,
      pol: 'CLVAP',
      pod: 'NLRTM',
      compartmentId: 'H3-B',
      consignee: 'COBANA',
    },
    {
      shipmentId: '3',
      shipmentNumber: 'SHP-003',
      cargoType: 'TABLE_GRAPES',
      quantity: 600,
      pol: 'CLVAP',
      pod: 'NLRTM',
      compartmentId: null,
      consignee: 'Del Monte',
    },
    {
      shipmentId: '4',
      shipmentNumber: 'SHP-004',
      cargoType: 'AVOCADOS',
      quantity: 400,
      pol: 'COSMA',
      pod: 'NLRTM',
      compartmentId: null,
      consignee: 'FYFFES',
    },
  ]);

  const tempZoneConfig = [
    { sectionId: '1AB', zoneId: 'ZONE_1AB', temp: 13, compartments: ['H1-A', 'H1-B'] },
    { sectionId: '1CD', zoneId: 'ZONE_1CD', temp: 13, compartments: ['H1-C', 'H1-D'] },
    { sectionId: '2UPDAB', zoneId: 'ZONE_2UPDAB', temp: 13, compartments: ['H2-UPD', 'H2-A', 'H2-B'] },
    { sectionId: '2CD', zoneId: 'ZONE_2CD', temp: 13, compartments: ['H2-C', 'H2-D'] },
    { sectionId: '3UPDAB', zoneId: 'ZONE_3UPDAB', temp: 13, compartments: ['H3-UPD', 'H3-A', 'H3-B'] },
    { sectionId: '3CD', zoneId: 'ZONE_3CD', temp: 0, compartments: ['H3-C', 'H3-D'] },
    { sectionId: '4UPDAB', zoneId: 'ZONE_4UPDAB', temp: 6, compartments: ['H4-UPD', 'H4-A', 'H4-B'] },
    { sectionId: '4CD', zoneId: 'ZONE_4CD', temp: 6, compartments: ['H4-C', 'H4-D'] },
  ];

  const validation = {
    overstowViolations: [],
    temperatureConflicts: [
      {
        compartmentId: 'H3-D',
        description: 'Grapes require 0°C but section is at +13°C',
        affectedShipments: ['SHP-003'],
      },
    ],
    weightDistributionWarnings: [
      'Port list of 0.8° detected - consider redistributing cargo',
    ],
  };

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

  const stowedShipments = shipments.filter(s => s.compartmentId);
  const unstowedShipments = shipments.filter(s => !s.compartmentId);
  const totalPallets = shipments.reduce((sum, s) => sum + s.quantity, 0);
  const stowedPallets = stowedShipments.reduce((sum, s) => sum + s.quantity, 0);

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
    if (!assigningShipment || !selectedCompartment) return;
    setShipments(prev => prev.map(s =>
      s.shipmentId === assigningShipment.shipmentId
        ? { ...s, compartmentId: selectedCompartment }
        : s
    ));
    setAssigningShipment(null);
    setSelectedCompartment('');
  };

  const handleRemoveAssignment = (shipmentId: string) => {
    setShipments(prev => prev.map(s =>
      s.shipmentId === shipmentId ? { ...s, compartmentId: null } : s
    ));
  };

  const handleAutoStow = () => {
    // TODO: Implement auto-stow algorithm
    console.log('Running auto-stow algorithm...');
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
              {validation.temperatureConflicts.length > 0 && (
                <span className={styles.badge}>{validation.temperatureConflicts.length}</span>
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
                            <span className={styles.label}>Quantity:</span>
                            <span className={styles.value}>{shipment.quantity} pallets</span>
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
                      <div key={shipment.shipmentId} className={`${styles.cargoCard} ${styles.stowed}`}>
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
                            <span className={styles.label}>Location:</span>
                            <span className={styles.value}>{shipment.compartmentId}</span>
                          </div>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Quantity:</span>
                            <span className={styles.value}>{shipment.quantity} pallets</span>
                          </div>
                          <div className={styles.cargoInfo}>
                            <span className={styles.label}>Consignee:</span>
                            <span className={styles.value}>{shipment.consignee}</span>
                          </div>
                        </div>
                        <button
                          className={styles.btnRemove}
                          onClick={() => handleRemoveAssignment(shipment.shipmentId)}
                        >
                          Remove
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
                      <div key={idx} className={styles.conflictCard}>
                        <div className={styles.conflictHeader}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                            <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                          </svg>
                          <span>{conflict.compartmentId}</span>
                        </div>
                        <p>{conflict.description}</p>
                        <div className={styles.affectedShipments}>
                          Affected: {conflict.affectedShipments.join(', ')}
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
          <VesselProfile />

          {/* Temperature Zone Legend */}
          <div className={styles.tempZoneLegend}>
            <h3>Temperature Configuration</h3>
            <div className={styles.zoneList}>
              {tempZoneConfig.map(zone => (
                <div key={zone.sectionId} className={styles.zoneItem}>
                  <div className={styles.zoneInfo}>
                    <strong>{zone.sectionId}</strong>
                    <span className={styles.temp}>
                      {zone.temp > 0 ? '+' : ''}{zone.temp}°C
                    </span>
                  </div>
                  <div className={styles.compartments}>
                    {zone.compartments.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Assign to Compartment Modal */}
      {assigningShipment && (
        <div className={styles.modalOverlay} onClick={() => setAssigningShipment(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Assign {assigningShipment.shipmentNumber}</h3>
              <button className={styles.modalClose} onClick={() => setAssigningShipment(null)}>✕</button>
            </div>

            <div className={styles.modalMeta}>
              <span
                className={styles.cargoDot}
                style={{ backgroundColor: getCargoTypeColor(assigningShipment.cargoType) }}
              />
              <span>{assigningShipment.cargoType.replace('_', ' ')}</span>
              <span className={styles.separator}>·</span>
              <span>{assigningShipment.quantity} pallets</span>
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
                  {zone.compartments.map(compId => (
                    <label key={compId} className={`${styles.compartmentOption} ${selectedCompartment === compId ? styles.selected : ''}`}>
                      <input
                        type="radio"
                        name="compartment"
                        value={compId}
                        checked={selectedCompartment === compId}
                        onChange={() => setSelectedCompartment(compId)}
                      />
                      <span className={styles.compartmentId}>{compId}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => setAssigningShipment(null)}>
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                disabled={!selectedCompartment}
                onClick={handleConfirmAssign}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}