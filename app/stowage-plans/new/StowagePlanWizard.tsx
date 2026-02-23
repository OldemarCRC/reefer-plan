'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { createStowagePlanFromWizard, copyStowagePlan } from '@/app/actions/stowage-plan';

type WizardStep = 'voyage' | 'temperature' | 'review';

const UNSENT_STATUSES = ['ESTIMATED', 'DRAFT'];

interface TempAssignment {
  coolingSectionId: string;
  targetTemp: number;
}

interface WizardVesselZone {
  zoneId: string;
  coolingSections: { sectionId: string }[];
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

export default function StowagePlanWizard({ voyages, initialVoyageId }: Props) {
  const router = useRouter();

  const initialVoyage = voyages.find(v => v._id === initialVoyageId) ?? null;

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialVoyageId ? 'temperature' : 'voyage'
  );
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>(
    initialVoyageId ?? ''
  );
  const [tempAssignments, setTempAssignments] = useState<TempAssignment[]>(
    initialVoyage
      ? initialVoyage.latestPlan
        ? makeAssignmentsFromPlan(initialVoyage.latestPlan)
        : makeDefaultAssignments(initialVoyage.vesselZones)
      : []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId) ?? null;
  const vesselZones: WizardVesselZone[] = selectedVoyage?.vesselZones ?? [];
  const isRevision = !!selectedVoyage?.latestPlan;
  const latestPlan = selectedVoyage?.latestPlan ?? null;

  // Derive hold numbers from zone IDs (e.g. '1AB' → 1, '2UPDAB' → 2)
  const holdNums = [...new Set(vesselZones.map(z => parseInt(z.zoneId[0])))].sort(
    (a, b) => a - b
  );

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
      prev.map(a =>
        a.coolingSectionId === sectionId ? { ...a, targetTemp: value } : a
      )
    );
  };

  const handleCreatePlan = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let result: { success: boolean; planId?: string; error?: string };

      if (isRevision && latestPlan) {
        // Revision: copy the latest plan (preserves cargo + temp config)
        result = await copyStowagePlan(latestPlan.planId);
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

  // When skipping Step 1, "Back" on Step 2 returns to the voyage list page
  const handleBackFromTemp = () => {
    if (initialVoyageId) {
      router.push('/stowage-plans/new');
    } else {
      setCurrentStep('voyage');
    }
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

        {/* Progress Steps */}
        <div className={styles.steps}>
          <div
            className={`${styles.step} ${currentStep === 'voyage' ? styles.active : ''} ${selectedVoyageId ? styles.completed : ''}`}
          >
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepLabel}>Select Voyage</div>
          </div>
          <div className={styles.stepConnector} />
          <div
            className={`${styles.step} ${currentStep === 'temperature' ? styles.active : ''} ${currentStep === 'review' ? styles.completed : ''}`}
          >
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepLabel}>Temperature Zones</div>
          </div>
          <div className={styles.stepConnector} />
          <div className={`${styles.step} ${currentStep === 'review' ? styles.active : ''}`}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepLabel}>Review & Create</div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* STEP 1: Select Voyage */}
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
                          <span className={styles.revisionBadge}>
                            Revision
                          </span>
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

        {/* STEP 2: Temperature Zone Assignment */}
        {currentStep === 'temperature' && (
          <div className={styles.stepContent}>
            <h2>{isRevision ? 'Temperature Configuration (Read-only)' : 'Assign Temperature Zones'}</h2>

            {isRevision ? (
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
            ) : (
              <p className={styles.stepDescription}>
                Configure temperature zones for each cooling section. Each section can be set to a
                different temperature based on cargo requirements.
              </p>
            )}

            {vesselZones.length === 0 ? (
              <p className={styles.stepDescription}>
                No temperature zone data found for this vessel. Contact your administrator.
              </p>
            ) : (
              <div className={styles.tempTable}>
                <div className={styles.tableHeader}>
                  <div className={styles.colSection}>Zone</div>
                  <div className={styles.colCompartments}>Cooling Sections</div>
                  <div className={styles.colTemp}>Target Temp (°C)</div>
                </div>

                {vesselZones.map(zone => {
                  const assignment = tempAssignments.find(
                    a => a.coolingSectionId === zone.zoneId
                  );
                  return (
                    <div key={zone.zoneId} className={styles.tableRow}>
                      <div className={styles.colSection}>
                        <strong>{zone.zoneId}</strong>
                      </div>
                      <div className={styles.colCompartments}>
                        {zone.coolingSections.map(s => s.sectionId).join(', ')}
                      </div>
                      <div className={styles.colTemp}>
                        {isRevision ? (
                          <span className={styles.tempReadOnly}>
                            {(assignment?.targetTemp ?? 13) > 0 ? '+' : ''}
                            {assignment?.targetTemp ?? 13}°C
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={assignment?.targetTemp ?? 13}
                            onChange={e =>
                              handleTempChange(zone.zoneId, parseFloat(e.target.value))
                            }
                            min={-25}
                            max={15}
                            step={0.5}
                            className={styles.tempInput}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

        {/* STEP 3: Review & Create */}
        {currentStep === 'review' && (
          <div className={styles.stepContent}>
            <h2>Review {isRevision ? 'Revision' : 'Stowage Plan'}</h2>
            <p className={styles.stepDescription}>
              Review the configuration before creating the stowage plan.
            </p>

            {selectedVoyage && (
              <div className={styles.reviewSection}>
                <h3>Voyage Information</h3>
                <div className={styles.reviewGrid}>
                  <div className={styles.reviewItem}>
                    <span className={styles.label}>Voyage Number:</span>
                    <span className={styles.value}>{selectedVoyage.voyageNumber}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.label}>Vessel:</span>
                    <span className={styles.value}>{selectedVoyage.vesselName}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.label}>Departure Date:</span>
                    <span className={styles.value}>{selectedVoyage.startDate}</span>
                  </div>
                  <div className={styles.reviewItem}>
                    <span className={styles.label}>Status:</span>
                    <span className={styles.value}>{selectedVoyage.status}</span>
                  </div>
                  {isRevision && latestPlan && (
                    <div className={styles.reviewItem}>
                      <span className={styles.label}>Copied from:</span>
                      <span className={styles.value}>{latestPlan.planNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={styles.reviewSection}>
              <h3>Temperature Configuration{isRevision ? ' (inherited)' : ''}</h3>
              <div className={styles.tempSummary}>
                {holdNums.map(holdNum => (
                  <div key={holdNum} className={styles.holdColumn}>
                    <div className={styles.holdLabel}>Hold {holdNum}</div>
                    {vesselZones
                      .filter(z => parseInt(z.zoneId[0]) === holdNum)
                      .map(zone => {
                        const assignment = tempAssignments.find(
                          a => a.coolingSectionId === zone.zoneId
                        );
                        const temp = assignment?.targetTemp ?? 13;
                        const color = tempToColor(temp);
                        return (
                          <div
                            key={zone.zoneId}
                            className={styles.sectionCard}
                            style={{ borderColor: color }}
                          >
                            <div className={styles.sectionHeader}>
                              <span className={styles.sectionName}>{zone.zoneId}</span>
                              <span className={styles.sectionTemp}>
                                {temp > 0 ? '+' : ''}
                                {temp}°C
                              </span>
                            </div>
                            <div
                              className={styles.tempBar}
                              style={{ backgroundColor: color }}
                            />
                            <div className={styles.compartments}>
                              {zone.coolingSections.map(s => s.sectionId).join(', ')}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
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
                  <path d="M10 8v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p>
                  The previous plan <strong>{latestPlan.planNumber}</strong> has not been sent
                  to the captain yet (status: {latestPlan.status}). A new revision will be created
                  alongside it. The previous plan will remain accessible.
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
                  After creating this plan, you&apos;ll be able to add cargo manually or use the
                  auto-stow algorithm to automatically place bookings based on temperature
                  requirements and vessel stability.
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
                  : 'Create Stowage Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
