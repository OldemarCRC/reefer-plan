'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { createStowagePlanFromWizard, copyStowagePlan, autoGenerateSinglePlan } from '@/app/actions/stowage-plan';
import VesselProfile from '@/components/vessel/VesselProfile';
import { buildVesselLayout } from '@/lib/vessel-profile-data';
import type { VesselLayout } from '@/lib/vessel-profile-data';

type WizardStep = 'voyage' | 'temperature' | 'review';

const UNSENT_STATUSES = ['ESTIMATED', 'DRAFT'];

interface TempAssignment {
  coolingSectionId: string;
  targetTemp: number;
}

interface WizardVesselZone {
  zoneId: string;
  coolingSections: { sectionId: string; sqm?: number }[];
}

export interface WizardLatestPlan {
  planId: string;
  planNumber: string;
  status: string;
  coolingSectionTemps: { zoneId: string; assignedTemperature: number }[];
}

export interface WizardVoyage {
  _id: string;
  voyageNumber: string;
  vesselName: string;
  startDate: string;
  status: string;
  portCalls: { portName: string; sequence: number }[];
  vesselZones: WizardVesselZone[];
  latestPlan: WizardLatestPlan | null;
}

interface Props {
  voyages: WizardVoyage[];
  initialVoyageId: string | null;
  mode?: 'auto' | 'manual';
}

function makeDefaultAssignments(zones: WizardVesselZone[]): TempAssignment[] {
  return zones.map(z => ({ coolingSectionId: z.zoneId, targetTemp: 13 }));
}

function makeAssignmentsFromPlan(plan: WizardLatestPlan): TempAssignment[] {
  return plan.coolingSectionTemps.map(cs => ({
    coolingSectionId: cs.zoneId,
    targetTemp: cs.assignedTemperature,
  }));
}

function tempToColor(temp: number) {
  const hue = Math.round(240 - ((temp + 25) / 40) * 240);
  return `hsl(${hue}, 70%, 50%)`;
}

export default function StowagePlanWizard({ voyages, initialVoyageId, mode = 'manual' }: Props) {
  const router = useRouter();

  const initialVoyage = voyages.find(v => v._id === initialVoyageId) ?? null;

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialVoyageId ? 'temperature' : 'voyage'
  );
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>(initialVoyageId ?? '');
  const [tempAssignments, setTempAssignments] = useState<TempAssignment[]>(
    initialVoyage
      ? initialVoyage.latestPlan
        ? makeAssignmentsFromPlan(initialVoyage.latestPlan)
        : makeDefaultAssignments(initialVoyage.vesselZones)
      : []
  );
  const [bulkTemp, setBulkTemp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId) ?? null;
  const vesselZones: WizardVesselZone[] = selectedVoyage?.vesselZones ?? [];
  const isRevision = !!selectedVoyage?.latestPlan;
  const latestPlan = selectedVoyage?.latestPlan ?? null;

  const holdNums = [...new Set(vesselZones.map(z => parseInt(z.zoneId[0])))].sort(
    (a, b) => a - b
  );

  // Derive vessel layout and editable zone temps from current selections
  const vesselLayout: VesselLayout | undefined = selectedVoyage?.vesselZones?.length
    ? buildVesselLayout(selectedVoyage.vesselZones)
    : undefined;

  // Convert TempAssignment[] → Record<zoneId, temp> for VesselProfile editable mode
  const editableZoneTemps: Record<string, number> = Object.fromEntries(
    tempAssignments
      .filter(a => !isNaN(a.targetTemp))
      .map(a => [a.coolingSectionId, a.targetTemp])
  );

  // Stable callback for VesselProfile's per-compartment inputs
  const handleZoneTempChange = useCallback((zoneId: string, temp: number) => {
    setTempAssignments(prev =>
      prev.map(a => a.coolingSectionId === zoneId ? { ...a, targetTemp: temp } : a)
    );
  }, []);

  const handleVoyageSelect = (voyageId: string) => {
    const voyage = voyages.find(v => v._id === voyageId);
    setSelectedVoyageId(voyageId);
    if (voyage?.latestPlan) {
      setTempAssignments(makeAssignmentsFromPlan(voyage.latestPlan));
    } else {
      setTempAssignments(voyage ? makeDefaultAssignments(voyage.vesselZones) : []);
    }
  };

  const handleTempChange = (sectionId: string, value: number) => {
    setTempAssignments(prev =>
      prev.map(a => a.coolingSectionId === sectionId ? { ...a, targetTemp: value } : a)
    );
  };

  const handleApplyAll = () => {
    const num = parseFloat(bulkTemp);
    if (isNaN(num) || num < -25 || num > 15) return;
    setTempAssignments(prev => prev.map(a => ({ ...a, targetTemp: num })));
  };

  const handleClearAll = () => {
    setTempAssignments(prev => prev.map(a => ({ ...a, targetTemp: 13 })));
    setBulkTemp('');
  };

  const handleCreatePlan = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let result: { success: boolean; planId?: string; error?: string };
      if (isRevision && latestPlan) {
        result = await copyStowagePlan(latestPlan.planId);
      } else if (mode === 'auto') {
        const zoneTemperatures: Record<string, number> = Object.fromEntries(
          tempAssignments.map(a => [a.coolingSectionId, a.targetTemp])
        );
        result = await autoGenerateSinglePlan(selectedVoyageId, zoneTemperatures);
      } else {
        result = await createStowagePlanFromWizard({
          voyageId: selectedVoyageId,
          coolingSectionTemps: tempAssignments.map(a => ({
            coolingSectionId: a.coolingSectionId,
            targetTemp: a.targetTemp,
          })),
        });
      }
      if (result.success && result.planId) {
        router.push(`/stowage-plans/${result.planId}`);
      } else {
        setSubmitError(result.error ?? 'Failed to create plan');
      }
    } catch {
      setSubmitError('Server error — check database connection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackFromTemp = () => {
    if (initialVoyageId) {
      router.push('/stowage-plans/new');
    } else {
      setCurrentStep('voyage');
    }
  };

  const stepClass = (step: WizardStep) => {
    const order: WizardStep[] = ['voyage', 'temperature', 'review'];
    const curr = order.indexOf(currentStep);
    const s = order.indexOf(step);
    if (s === curr) return styles.wizStepActive;
    if (s < curr) return styles.wizStepDone;
    return styles.wizStepInactive;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1>{isRevision ? 'Create Revision' : 'Create Stowage Plan'}</h1>
          <Link href="/stowage-plans" className={styles.cancelBtn}>
            Cancel
          </Link>
        </div>

        {/* Text-based step breadcrumb (teal active / green done / muted inactive) */}
        <div className={styles.wizSteps}>
          <span className={stepClass('voyage')}>1 · Select Voyage</span>
          <span className={styles.wizStepArrow}>›</span>
          <span className={stepClass('temperature')}>2 · Configure Temperatures</span>
          <span className={styles.wizStepArrow}>›</span>
          <span className={stepClass('review')}>3 · Review & Create</span>
        </div>
      </div>

      <div className={styles.content}>
        {/* ── STEP 1: Select Voyage ─────────────────────────────────── */}
        {currentStep === 'voyage' && (
          <div className={styles.stepContent}>
            <h2>Select a Voyage</h2>
            <p className={styles.stepDescription}>
              Choose the voyage for which you want to create a stowage plan.
              Voyages that already have plans will create a revision (copy).
            </p>

            {voyages.length === 0 ? (
              <p className={styles.stepDescription}>
                No active voyages found. Create a voyage first.
              </p>
            ) : (
              <div className={styles.voyageGrid}>
                {voyages.map(voyage => (
                  <div
                    key={voyage._id}
                    className={`${styles.voyageCard} ${selectedVoyageId === voyage._id ? styles.selected : ''}`}
                    onClick={() => handleVoyageSelect(voyage._id)}
                  >
                    <div className={styles.voyageHeader}>
                      <h3>{voyage.voyageNumber}</h3>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {voyage.latestPlan && (
                          <span className={styles.revisionBadge}>Revision</span>
                        )}
                        <span
                          className={`${styles.statusBadge} ${styles[voyage.status.toLowerCase()]}`}
                        >
                          {voyage.status}
                        </span>
                      </div>
                    </div>
                    <div className={styles.voyageDetails}>
                      <div className={styles.detail}>
                        <span className={styles.label}>Vessel:</span>
                        <span className={styles.value}>{voyage.vesselName}</span>
                      </div>
                      <div className={styles.detail}>
                        <span className={styles.label}>Departure:</span>
                        <span className={styles.value}>{voyage.startDate}</span>
                      </div>
                      <div className={styles.detail}>
                        <span className={styles.label}>Route:</span>
                        <span className={styles.value}>
                          {voyage.portCalls.map(pc => pc.portName).join(' → ')}
                        </span>
                      </div>
                      {voyage.latestPlan && (
                        <div className={styles.detail}>
                          <span className={styles.label}>Latest plan:</span>
                          <span className={styles.value}>{voyage.latestPlan.planNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                disabled={!selectedVoyageId}
                onClick={() => setCurrentStep('temperature')}
              >
                {isRevision ? 'Continue to Review Configuration' : 'Continue to Temperature Setup'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Temperature Zone Assignment ───────────────────── */}
        {currentStep === 'temperature' && (
          <div className={styles.stepContent}>
            <h2>{isRevision ? 'Temperature Configuration (Read-only)' : 'Assign Temperature Zones'}</h2>

            {isRevision ? (
              // Revision: inherited temps — read-only info box + summary table
              <>
                <div className={styles.infoBox}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 6v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p>
                    Temperature zones are inherited from{' '}
                    <strong>{latestPlan?.planNumber}</strong>. To change zone temperatures,
                    open the plan and use the Configure Zones option.
                  </p>
                </div>

                {vesselZones.length > 0 && (
                  <div className={styles.tempTable}>
                    <div className={styles.tableHeader}>
                      <div className={styles.colZone}>Zone</div>
                      <div className={styles.colSections}>Cooling Sections</div>
                      <div className={styles.colTemp}>Temperature</div>
                    </div>
                    {vesselZones.map(zone => {
                      const a = tempAssignments.find(x => x.coolingSectionId === zone.zoneId);
                      const temp = a?.targetTemp ?? 13;
                      return (
                        <div key={zone.zoneId} className={styles.tableRow}>
                          <div className={styles.colZone}><strong>{zone.zoneId}</strong></div>
                          <div className={styles.colSections}>
                            {zone.coolingSections.map(s => s.sectionId).join(', ')}
                          </div>
                          <div className={styles.colTemp}>
                            <span className={styles.tempReadOnly}>
                              {temp > 0 ? '+' : ''}{temp}°C
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : vesselZones.length === 0 ? (
              <p className={styles.stepDescription}>
                No temperature zone data found for this vessel. Contact your administrator.
              </p>
            ) : (
              // Normal: bulk toolbar → vessel diagram (per-compartment inputs) → read-only summary
              <>
                <p className={styles.stepDescription}>
                  Set the target temperature for each cooling zone. Use "Apply to all" for a
                  uniform temperature, or click individual compartments in the vessel diagram.
                </p>

                {/* Bulk Apply toolbar — sets all zones at once */}
                <div className={styles.bulkToolbar}>
                  <input
                    type="number"
                    step="0.5"
                    min="-25"
                    max="15"
                    value={bulkTemp}
                    onChange={e => setBulkTemp(e.target.value)}
                    placeholder="°C"
                    className={styles.bulkInput}
                  />
                  <button
                    className={styles.bulkApply}
                    onClick={handleApplyAll}
                    disabled={
                      bulkTemp === '' ||
                      isNaN(parseFloat(bulkTemp)) ||
                      parseFloat(bulkTemp) < -25 ||
                      parseFloat(bulkTemp) > 15
                    }
                  >
                    Apply to all zones
                  </button>
                  <button className={styles.bulkClear} onClick={handleClearAll}>
                    Reset to default
                  </button>
                </div>

                {/* Vessel diagram — per-compartment editable temperature inputs */}
                <div className={styles.svgWrap}>
                  <VesselProfile
                    vesselName={selectedVoyage!.vesselName}
                    voyageNumber={selectedVoyage!.voyageNumber}
                    vesselLayout={vesselLayout}
                    tempAssignments={[]}
                    editableZoneTemps={editableZoneTemps}
                    onZoneTempChange={handleZoneTempChange}
                    showCompartmentTooltip={false}
                  />
                </div>

                {/* Zone summary — read-only mirror of the compartment inputs */}
                <div className={styles.tempTable}>
                  <div className={styles.tableHeader}>
                    <div className={styles.colZone}>Zone</div>
                    <div className={styles.colSections}>Cooling Sections</div>
                    <div className={styles.colTemp}>Temperature</div>
                  </div>
                  {vesselZones.map(zone => {
                    const a = tempAssignments.find(x => x.coolingSectionId === zone.zoneId);
                    const temp = a?.targetTemp ?? 13;
                    return (
                      <div key={zone.zoneId} className={styles.tableRow}>
                        <div className={styles.colZone}><strong>{zone.zoneId}</strong></div>
                        <div className={styles.colSections}>
                          {zone.coolingSections.map(s => s.sectionId).join(', ')}
                        </div>
                        <div className={styles.colTemp}>
                          <span className={styles.tempReadOnly}>
                            {temp > 0 ? '+' : ''}{temp}°C
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={handleBackFromTemp}>
                Back
              </button>
              <button
                className={styles.btnPrimary}
                onClick={() => setCurrentStep('review')}
                disabled={vesselZones.length === 0}
              >
                Continue to Review
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Review & Create ────────────────────────────────── */}
        {currentStep === 'review' && selectedVoyage && (
          <div className={styles.stepContent}>
            <h2>Review {isRevision ? 'Revision' : 'Stowage Plan'}</h2>
            <p className={styles.stepDescription}>
              Review the configuration before creating the{' '}
              {isRevision ? 'revision' : 'stowage plan'}.
            </p>

            {/* Maritime summary card */}
            <div className={styles.maritimeCard}>
              <div className={styles.maritimeCardHeader}>
                <div>
                  <div className={styles.maritimeVesselName}>{selectedVoyage.vesselName}</div>
                  <div className={styles.maritimeVoyageNum}>{selectedVoyage.voyageNumber}</div>
                </div>
                <div className={styles.maritimeCardMeta}>
                  {isRevision && latestPlan && (
                    <span className={styles.revisionBadge}>
                      Revision of {latestPlan.planNumber}
                    </span>
                  )}
                  <span
                    className={`${styles.statusBadge} ${styles[selectedVoyage.status.toLowerCase()]}`}
                  >
                    {selectedVoyage.status}
                  </span>
                  <span className={styles.maritimeDate}>{selectedVoyage.startDate}</span>
                </div>
              </div>

              {/* Route */}
              {selectedVoyage.portCalls.length > 0 && (
                <div className={styles.maritimeRoute}>
                  {[...selectedVoyage.portCalls]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((pc, i) => (
                      <span key={i} className={styles.maritimeRouteItem}>
                        {i > 0 && <span className={styles.maritimeRouteArrow}>→</span>}
                        <span className={styles.maritimePort}>{pc.portName}</span>
                      </span>
                    ))}
                </div>
              )}

              {/* Temperature zones grouped by hold */}
              {holdNums.length > 0 && (
                <div className={styles.maritimeTempSection}>
                  <div className={styles.maritimeTempLabel}>Temperature Configuration</div>
                  <div className={styles.maritimeTempGrid}>
                    {holdNums.map(holdNum => (
                      <div key={holdNum} className={styles.maritimeHoldGroup}>
                        <div className={styles.maritimeHoldTitle}>Hold {holdNum}</div>
                        {vesselZones
                          .filter(z => parseInt(z.zoneId[0]) === holdNum)
                          .map(zone => {
                            const a = tempAssignments.find(
                              x => x.coolingSectionId === zone.zoneId
                            );
                            const temp = a?.targetTemp ?? 13;
                            const color = tempToColor(temp);
                            return (
                              <div
                                key={zone.zoneId}
                                className={styles.maritimeZoneChip}
                                style={{ borderColor: color }}
                              >
                                <span className={styles.maritimeZoneId}>{zone.zoneId}</span>
                                <span
                                  className={styles.maritimeZoneTemp}
                                  style={{ color }}
                                >
                                  {temp > 0 ? '+' : ''}{temp}°C
                                </span>
                                <div className={styles.maritimeZoneSections}>
                                  {zone.coolingSections.map(s => s.sectionId).join(', ')}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Warning: previous plan is unsent */}
            {isRevision && latestPlan && UNSENT_STATUSES.includes(latestPlan.status) && (
              <div className={styles.warningBox}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2L1 18h18L10 2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 8v4m0 3h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <p>
                  The previous plan <strong>{latestPlan.planNumber}</strong> has not been sent
                  to the captain yet (status: {latestPlan.status}). A new revision will be
                  created alongside it.
                </p>
              </div>
            )}

            {!isRevision && (
              <div className={styles.infoBox}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M10 6v4m0 4h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <p>
                  {mode === 'auto'
                    ? 'The stowage engine will automatically place bookings and contract estimates into the configured temperature zones.'
                    : "After creating this plan, you'll be able to add cargo manually or use the auto-stow algorithm to automatically place bookings based on temperature requirements and vessel stability."}
                </p>
              </div>
            )}

            {submitError && <div className={styles.errorBox}>{submitError}</div>}

            <div className={styles.actions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setCurrentStep('temperature')}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleCreatePlan}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Creating…'
                  : isRevision
                  ? 'Create Revision'
                  : mode === 'auto'
                  ? '⚡ Auto-Generate Plan'
                  : 'Create Stowage Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
