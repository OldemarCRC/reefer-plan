'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import VesselProfile from '@/components/vessel/VesselProfile';
import { getVoyagesWithoutPlans, autoGenerateSinglePlan } from '@/app/actions/stowage-plan';
import { buildVesselLayout } from '@/lib/vessel-profile-data';
import type { VesselLayout } from '@/lib/vessel-profile-data';
import styles from './page.module.css';

type Step = 'idle' | 'step1' | 'step2';

interface VesselOption {
  _id: string;
  name: string;
  temperatureZones: Array<{
    zoneId: string;
    coolingSections: Array<{ sectionId: string; sqm: number }>;
  }>;
}

interface VoyageOption {
  _id: string;
  voyageNumber: string;
  status: string;
  departureDate?: string;
  vesselId?: VesselOption;
}

export default function AutoGenerateButton() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [isLoadingVoyages, startLoadTransition] = useTransition();
  const [isGenerating, startGenTransition] = useTransition();
  const [voyages, setVoyages] = useState<VoyageOption[]>([]);
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>('');
  const [editableZoneTemps, setEditableZoneTemps] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [bulkTemp, setBulkTemp] = useState<string>('');

  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId) ?? null;

  const vesselLayout: VesselLayout | undefined = selectedVoyage?.vesselId?.temperatureZones
    ? buildVesselLayout(selectedVoyage.vesselId.temperatureZones as any[])
    : undefined;

  const zones = selectedVoyage?.vesselId?.temperatureZones ?? [];

  const handleOpen = () => {
    setError(null);
    setEditableZoneTemps({});
    setSelectedVoyageId('');
    startLoadTransition(async () => {
      const res = await getVoyagesWithoutPlans();
      if (res.success) {
        setVoyages(res.data as VoyageOption[]);
        setStep('step1');
      } else {
        setError((res as any).error ?? 'Failed to load voyages');
      }
    });
  };

  const handleNext = () => {
    if (!selectedVoyageId) return;
    setEditableZoneTemps({});
    setStep('step2');
  };

  const handleZoneTempChange = useCallback((zoneId: string, temp: number) => {
    setEditableZoneTemps(prev => ({ ...prev, [zoneId]: temp }));
  }, []);

  const handleGenerate = () => {
    if (!selectedVoyageId) return;
    startGenTransition(async () => {
      const res = await autoGenerateSinglePlan(selectedVoyageId, editableZoneTemps);
      if (res.success && res.planId) {
        router.push(`/stowage-plans/${res.planId}`);
      } else {
        setError(res.error ?? 'Generation failed');
      }
    });
  };

  const handleClose = () => {
    setStep('idle');
    setError(null);
    setBulkTemp('');
  };

  const handleApplyAll = useCallback(() => {
    const num = parseFloat(bulkTemp);
    if (isNaN(num) || num < -25 || num > 15) return;
    const allZones = zones.reduce((acc: Record<string, number>, tz: any) => {
      acc[tz.zoneId] = num;
      return acc;
    }, {});
    setEditableZoneTemps(allZones);
  }, [bulkTemp, zones]);

  const handleClearAll = useCallback(() => {
    setEditableZoneTemps({});
    setBulkTemp('');
  }, []);

  const validTempCount = Object.values(editableZoneTemps).filter(v => !isNaN(v)).length;
  const canGenerate = validTempCount > 0;

  return (
    <>
      <button
        className={styles.btnAutoGen}
        onClick={handleOpen}
        disabled={isLoadingVoyages}
        title="Create a draft stowage plan — select voyage and configure zone temperatures"
      >
        {isLoadingVoyages ? 'Loading…' : '⚡ Auto-Generate Plan'}
      </button>

      {/* ── MODAL OVERLAY ───────────────────────────────────────────────── */}
      {step !== 'idle' && (
        <div className={styles.autoGenOverlay} onClick={handleClose}>
          <div
            className={styles.autoGenModal}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header + step breadcrumb */}
            <div className={styles.autoGenModalHeader}>
              <div className={styles.autoGenSteps}>
                <span className={step === 'step1' ? styles.stepActive : styles.stepDone}>
                  1 · Select Voyage
                </span>
                <span className={styles.stepArrow}>›</span>
                <span className={step === 'step2' ? styles.stepActive : styles.stepInactive}>
                  2 · Configure Temperatures
                </span>
              </div>
              <button className={styles.autoGenClose} onClick={handleClose} aria-label="Close">
                ✕
              </button>
            </div>

            {error && <div className={styles.autoGenError}>{error}</div>}

            {/* ── STEP 1 — Voyage selection ──────────────────────────── */}
            {step === 'step1' && (
              <div className={styles.autoGenStep}>
                <p className={styles.autoGenHint}>
                  {voyages.length === 0
                    ? 'All active voyages already have stowage plans.'
                    : `${voyages.length} voyage${voyages.length !== 1 ? 's' : ''} without a stowage plan — select one to continue.`}
                </p>

                {voyages.length > 0 && (
                  <div className={styles.voyageList}>
                    {voyages.map(v => {
                      const vesselName = v.vesselId?.name ?? '—';
                      const depDate = v.departureDate
                        ? new Date(v.departureDate).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—';
                      return (
                        <label
                          key={v._id}
                          className={`${styles.voyageRow} ${selectedVoyageId === v._id ? styles.voyageRowSelected : ''}`}
                        >
                          <input
                            type="radio"
                            name="voyageSelect"
                            value={v._id}
                            checked={selectedVoyageId === v._id}
                            onChange={() => setSelectedVoyageId(v._id)}
                            className={styles.voyageRadio}
                          />
                          <span className={styles.voyageNumber}>{v.voyageNumber}</span>
                          <span className={styles.vesselName}>{vesselName}</span>
                          <span className={styles.voyageStatus}>{v.status.replace(/_/g, ' ')}</span>
                          <span className={styles.voyageDate}>{depDate}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className={styles.autoGenActions}>
                  <button className={styles.btnGhost} onClick={handleClose}>Cancel</button>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleNext}
                    disabled={!selectedVoyageId}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2 — Temperature configuration ────────────────── */}
            {step === 'step2' && selectedVoyage && (
              <div className={styles.autoGenStep}>
                <div>
                  <p className={styles.autoGenHint}>
                    <strong>{selectedVoyage.voyageNumber}</strong>
                    {selectedVoyage.vesselId ? ` · ${selectedVoyage.vesselId.name}` : ''}
                  </p>
                  <p className={styles.autoGenStep2Subtitle}>
                    Set the target temperature for each cooling zone. Sections in the same zone synchronize automatically.
                  </p>
                </div>

                {/* Bulk action toolbar */}
                <div className={styles.autoGenToolbar}>
                  <input
                    type="number"
                    step="1"
                    min="-25"
                    max="15"
                    value={bulkTemp}
                    onChange={(e) => setBulkTemp(e.target.value)}
                    placeholder="°C"
                    className={styles.autoGenBulkInput}
                  />
                  <button
                    className={styles.autoGenBulkApply}
                    onClick={handleApplyAll}
                    disabled={bulkTemp === '' || isNaN(parseFloat(bulkTemp)) || parseFloat(bulkTemp) < -25 || parseFloat(bulkTemp) > 15}
                  >
                    Apply to all zones
                  </button>
                  <button className={styles.autoGenClearAll} onClick={handleClearAll}>
                    Clear all
                  </button>
                </div>

                {/* Vessel longitudinal profile — empty (no cargo), temp inputs in footer */}
                <div className={styles.autoGenSvgWrap}>
                  <VesselProfile
                    vesselName={selectedVoyage.vesselId?.name ?? ''}
                    voyageNumber={selectedVoyage.voyageNumber}
                    vesselLayout={vesselLayout}
                    tempAssignments={[]}
                    editableZoneTemps={editableZoneTemps}
                    onZoneTempChange={handleZoneTempChange}
                  />
                </div>

                {/* Zone summary table — mirrors what was typed in the SVG */}
                {zones.length > 0 && (
                  <div className={styles.autoGenZoneTable}>
                    <div className={styles.autoGenZoneHeader}>
                      <span>Zone</span>
                      <span>Sections</span>
                      <span>Temperature</span>
                    </div>
                    {zones.map((tz: any) => {
                      const tempVal = editableZoneTemps[tz.zoneId];
                      const hasTemp = tempVal != null && !isNaN(tempVal);
                      return (
                        <div key={tz.zoneId} className={styles.autoGenZoneRow}>
                          <span className={styles.autoGenZoneId}>{tz.zoneId}</span>
                          <span className={styles.autoGenZoneSections}>
                            {(tz.coolingSections ?? []).map((cs: any) => cs.sectionId).join(' · ')}
                          </span>
                          <span className={`${styles.autoGenZoneTemp} ${hasTemp ? styles.autoGenZoneTempSet : ''}`}>
                            {hasTemp ? `${tempVal > 0 ? '+' : ''}${tempVal}°C` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className={styles.autoGenActions}>
                  <button className={styles.btnGhost} onClick={() => setStep('step1')}>← Back</button>
                  <span className={styles.autoGenTempCount}>
                    {validTempCount} / {zones.length} zone{zones.length !== 1 ? 's' : ''} configured
                  </span>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating}
                  >
                    {isGenerating ? 'Generating…' : 'Generate Plan'}
                  </button>
                </div>
                {!canGenerate && (
                  <p className={styles.autoGenGenHint}>
                    Enter at least one zone temperature to continue
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
