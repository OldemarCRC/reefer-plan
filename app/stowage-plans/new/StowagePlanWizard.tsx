'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { createStowagePlanFromWizard } from '@/app/actions/stowage-plan';

type WizardStep = 'voyage' | 'temperature' | 'review';

interface TempAssignment {
  coolingSectionId: string;
  targetTemp: number;
}

export interface WizardVoyage {
  _id: string;
  voyageNumber: string;
  vesselName: string;
  startDate: string;
  status: string;
  portCalls: { portName: string; sequence: number }[];
}

interface Props {
  voyages: WizardVoyage[];
  initialVoyageId: string | null;
}

const temperatureZones = [
  { zoneId: '1AB', coolingSectionIds: ['1A', '1B'], hold: 1 },
  { zoneId: '1CD', coolingSectionIds: ['1C', '1D'], hold: 1 },
  { zoneId: '2UPDAB', coolingSectionIds: ['2UPD', '2A', '2B'], hold: 2 },
  { zoneId: '2CD', coolingSectionIds: ['2C', '2D'], hold: 2 },
  { zoneId: '3UPDAB', coolingSectionIds: ['3UPD', '3A', '3B'], hold: 3 },
  { zoneId: '3CD', coolingSectionIds: ['3C', '3D'], hold: 3 },
  { zoneId: '4UPDAB', coolingSectionIds: ['4UPD', '4A', '4B'], hold: 4 },
  { zoneId: '4CD', coolingSectionIds: ['4C', '4D'], hold: 4 },
];

const defaultAssignments = temperatureZones.map(s => ({
  coolingSectionId: s.zoneId,
  targetTemp: 13,
}));

function tempToColor(temp: number) {
  const hue = Math.round(240 - ((temp + 25) / 40) * 240);
  return `hsl(${hue}, 70%, 50%)`;
}

export default function StowagePlanWizard({ voyages, initialVoyageId }: Props) {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialVoyageId ? 'temperature' : 'voyage'
  );
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>(
    initialVoyageId ?? ''
  );
  const [tempAssignments, setTempAssignments] = useState<TempAssignment[]>(
    initialVoyageId ? defaultAssignments : []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleVoyageSelect = (voyageId: string) => {
    setSelectedVoyageId(voyageId);
    setTempAssignments(defaultAssignments);
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
      const result = await createStowagePlanFromWizard({
        voyageId: selectedVoyageId,
        coolingSectionTemps: tempAssignments.map(a => ({
          coolingSectionId: a.coolingSectionId,
          targetTemp: a.targetTemp,
        })),
      });
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

  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId);

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
          <h1>Create Stowage Plan</h1>
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
                      <span
                        className={`${styles.statusBadge} ${styles[voyage.status.toLowerCase()]}`}
                      >
                        {voyage.status}
                      </span>
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
                Continue to Temperature Setup
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Temperature Zone Assignment */}
        {currentStep === 'temperature' && (
          <div className={styles.stepContent}>
            <h2>Assign Temperature Zones</h2>
            <p className={styles.stepDescription}>
              Configure temperature zones for each cooling section. Each section can be set to a
              different temperature based on cargo requirements.
            </p>

            <div className={styles.tempTable}>
              <div className={styles.tableHeader}>
                <div className={styles.colSection}>Cooling Section</div>
                <div className={styles.colCompartments}>Compartments</div>
                <div className={styles.colTemp}>Target Temp (°C)</div>
              </div>

              {tempAssignments.map(assignment => {
                const section = temperatureZones.find(
                  s => s.zoneId === assignment.coolingSectionId
                );
                return (
                  <div key={assignment.coolingSectionId} className={styles.tableRow}>
                    <div className={styles.colSection}>
                      <strong>{assignment.coolingSectionId}</strong>
                    </div>
                    <div className={styles.colCompartments}>
                      {section?.coolingSectionIds.join(', ')}
                    </div>
                    <div className={styles.colTemp}>
                      <input
                        type="number"
                        value={assignment.targetTemp}
                        onChange={e =>
                          handleTempChange(
                            assignment.coolingSectionId,
                            parseFloat(e.target.value)
                          )
                        }
                        min={-25}
                        max={15}
                        step={0.5}
                        className={styles.tempInput}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={handleBackFromTemp}>
                Back
              </button>
              <button
                className={styles.btnPrimary}
                onClick={() => setCurrentStep('review')}
              >
                Continue to Review
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Review & Create */}
        {currentStep === 'review' && (
          <div className={styles.stepContent}>
            <h2>Review Stowage Plan</h2>
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
                </div>
              </div>
            )}

            <div className={styles.reviewSection}>
              <h3>Temperature Configuration</h3>
              <div className={styles.tempSummary}>
                {[1, 2, 3, 4].map(holdNum => (
                  <div key={holdNum} className={styles.holdColumn}>
                    <div className={styles.holdLabel}>Hold {holdNum}</div>
                    {temperatureZones
                      .filter(section => section.hold === holdNum)
                      .map(section => {
                        const assignment = tempAssignments.find(
                          a => a.coolingSectionId === section.zoneId
                        );
                        const temp = assignment?.targetTemp ?? 13;
                        const color = tempToColor(temp);
                        return (
                          <div
                            key={section.zoneId}
                            className={styles.sectionCard}
                            style={{ borderColor: color }}
                          >
                            <div className={styles.sectionHeader}>
                              <span className={styles.sectionName}>{section.zoneId}</span>
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
                              {section.coolingSectionIds.join(', ')}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>

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
                After creating this plan, you'll be able to add cargo manually or use the
                auto-stow algorithm to automatically place bookings based on temperature
                requirements and vessel stability.
              </p>
            </div>

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
                {isSubmitting ? 'Creating…' : 'Create Stowage Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
