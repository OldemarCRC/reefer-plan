// app/stowage-plans/new/page.tsx
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

export default function NewStowagePlanPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>('voyage');
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>('');
  const [tempAssignments, setTempAssignments] = useState<TempAssignment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Mock data - replace with actual data fetching
  const voyages = [
    {
      _id: '1',
      voyageNumber: 'ACON-062026',
      vesselName: 'ACONCAGUA BAY',
      startDate: '2026-02-10',
      status: 'CONFIRMED',
      portCalls: [
        { portName: 'Valparaíso', sequence: 1 },
        { portName: 'Rotterdam', sequence: 2 },
      ],
    },
    {
      _id: '2',
      voyageNumber: 'ACON-072026',
      vesselName: 'ACONCAGUA BAY',
      startDate: '2026-02-24',
      status: 'PLANNED',
      portCalls: [
        { portName: 'Valparaíso', sequence: 1 },
        { portName: 'Rotterdam', sequence: 2 },
      ],
    },
  ];

  const coolingSections = [
    { sectionId: '1AB', compartmentIds: ['H1-A', 'H1-B'] },
    { sectionId: '1CD', compartmentIds: ['H1-C', 'H1-D'] },
    { sectionId: '2UPDAB', compartmentIds: ['H2-UPD', 'H2-A', 'H2-B'] },
    { sectionId: '2CD', compartmentIds: ['H2-C', 'H2-D'] },
    { sectionId: '3UPDAB', compartmentIds: ['H3-UPD', 'H3-A', 'H3-B'] },
    { sectionId: '3CD', compartmentIds: ['H3-C', 'H3-D'] },
    { sectionId: '4UPDAB', compartmentIds: ['H4-UPD', 'H4-A', 'H4-B'] },
    { sectionId: '4CD', compartmentIds: ['H4-C', 'H4-D'] },
  ];

  // Temperature zones are fixed per vessel — each zone controls 1+ cooling sections
  const temperatureZones = [
    { zoneId: 'ZONE_1AB', sectionId: '1AB', hold: 1 },
    { zoneId: 'ZONE_1CD', sectionId: '1CD', hold: 1 },
    { zoneId: 'ZONE_2UPDAB', sectionId: '2UPDAB', hold: 2 },
    { zoneId: 'ZONE_2CD', sectionId: '2CD', hold: 2 },
    { zoneId: 'ZONE_3UPDAB', sectionId: '3UPDAB', hold: 3 },
    { zoneId: 'ZONE_3CD', sectionId: '3CD', hold: 3 },
    { zoneId: 'ZONE_4UPDAB', sectionId: '4UPDAB', hold: 4 },
    { zoneId: 'ZONE_4CD', sectionId: '4CD', hold: 4 },
  ];

  const tempToColor = (temp: number) => {
    // -25°C → blue (hue 240), +15°C → red (hue 0)
    const hue = Math.round(240 - ((temp + 25) / 40) * 240);
    return `hsl(${hue}, 70%, 50%)`;
  };

  const handleVoyageSelect = (voyageId: string) => {
    setSelectedVoyageId(voyageId);
    const defaults = coolingSections.map(section => ({
      coolingSectionId: section.sectionId,
      targetTemp: 13, // Default banana temp
    }));
    setTempAssignments(defaults);
  };

  const handleTempChange = (sectionId: string, value: number) => {
    setTempAssignments(prev => prev.map(assignment =>
      assignment.coolingSectionId === sectionId
        ? { ...assignment, targetTemp: value }
        : assignment
    ));
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
        // TODO: Use real planId when DB is connected
        router.push('/stowage-plans/test-123');
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
          <div className={`${styles.step} ${currentStep === 'voyage' ? styles.active : ''} ${selectedVoyageId ? styles.completed : ''}`}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepLabel}>Select Voyage</div>
          </div>
          <div className={styles.stepConnector}></div>
          <div className={`${styles.step} ${currentStep === 'temperature' ? styles.active : ''} ${currentStep === 'review' ? styles.completed : ''}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepLabel}>Temperature Zones</div>
          </div>
          <div className={styles.stepConnector}></div>
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
            
            <div className={styles.voyageGrid}>
              {voyages.map(voyage => (
                <div
                  key={voyage._id}
                  className={`${styles.voyageCard} ${selectedVoyageId === voyage._id ? styles.selected : ''}`}
                  onClick={() => handleVoyageSelect(voyage._id)}
                >
                  <div className={styles.voyageHeader}>
                    <h3>{voyage.voyageNumber}</h3>
                    <span className={`${styles.statusBadge} ${styles[voyage.status.toLowerCase()]}`}>
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
                      <span className={styles.value}>{new Date(voyage.startDate).toLocaleDateString()}</span>
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
              Configure temperature zones for each cooling section. Each section can be set to a different temperature based on cargo requirements.
            </p>

            <div className={styles.tempTable}>
              <div className={styles.tableHeader}>
                <div className={styles.colSection}>Cooling Section</div>
                <div className={styles.colCompartments}>Compartments</div>
                <div className={styles.colTemp}>Target Temp (°C)</div>
              </div>

              {tempAssignments.map(assignment => {
                const section = coolingSections.find(s => s.sectionId === assignment.coolingSectionId);
                return (
                  <div key={assignment.coolingSectionId} className={styles.tableRow}>
                    <div className={styles.colSection}>
                      <strong>{assignment.coolingSectionId}</strong>
                    </div>
                    <div className={styles.colCompartments}>
                      {section?.compartmentIds.join(', ')}
                    </div>
                    <div className={styles.colTemp}>
                      <input
                        type="number"
                        value={assignment.targetTemp}
                        onChange={(e) => handleTempChange(assignment.coolingSectionId, parseFloat(e.target.value))}
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
              <button
                className={styles.btnSecondary}
                onClick={() => setCurrentStep('voyage')}
              >
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
                    <span className={styles.value}>{new Date(selectedVoyage.startDate).toLocaleDateString()}</span>
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
                      .filter(z => z.hold === holdNum)
                      .map(zone => {
                        const assignment = tempAssignments.find(a => a.coolingSectionId === zone.sectionId);
                        const temp = assignment?.targetTemp ?? 13;
                        const color = tempToColor(temp);
                        const section = coolingSections.find(s => s.sectionId === zone.sectionId);
                        return (
                          <div key={zone.zoneId} className={styles.zoneCard} style={{ borderColor: color }}>
                            <div className={styles.zoneHeader}>
                              <span className={styles.zoneName}>{zone.zoneId}</span>
                              <span className={styles.zoneTemp}>{temp > 0 ? '+' : ''}{temp}°C</span>
                            </div>
                            <div className={styles.tempBar} style={{ backgroundColor: color }}></div>
                            <div className={styles.sectionCard}>
                              <span className={styles.sectionName}>{zone.sectionId}</span>
                              <span className={styles.compartments}>{section?.compartmentIds.join(', ')}</span>
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
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 6v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <p>
                After creating this plan, you'll be able to add cargo manually or use the auto-stow algorithm 
                to automatically place bookings based on temperature requirements and vessel stability.
              </p>
            </div>

            {submitError && (
              <div className={styles.errorBox}>{submitError}</div>
            )}

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