'use client';

import { useState, useEffect } from 'react';
import { updateZoneTemperatures } from '@/app/actions/stowage-plan';
import styles from './ConfigureZonesModal.module.css';

// Acceptable temperature ranges per cargo type (industry operational standards)
const CARGO_TEMP_RANGES: Record<string, { min: number; max: number; label: string }> = {
  BANANAS:           { min: 12,   max: 14,   label: 'Banana' },
  PINEAPPLES:        { min: 7,    max: 10,   label: 'Pineapple' },
  AVOCADOS:          { min: 5,    max: 8,    label: 'Avocado' },
  CITRUS:            { min: 4,    max: 10,   label: 'Citrus' },
  TABLE_GRAPES:      { min: -0.5, max: 0.5,  label: 'Table grapes' },
  BERRIES:           { min: 0,    max: 2,    label: 'Berries' },
  KIWIS:             { min: 0,    max: 2,    label: 'Kiwis' },
  FROZEN_FISH:       { min: -25,  max: -18,  label: 'Frozen fish' },
  OTHER_FROZEN:      { min: -25,  max: -18,  label: 'Frozen cargo' },
  OTHER_CHILLED:     { min: -1,   max: 15,   label: 'Chilled cargo' },
};

export interface ZoneConfig {
  sectionId: string;        // '1AB'
  zoneName: string;         // 'Hold 1 A|B'
  compartmentIds: string[]; // ['1A', '1B']
  currentTemp: number;      // 13
  assignedCargoType?: string;
  palletsLoaded: number;
}

interface ConfigureZonesModalProps {
  planId: string;
  zones: ZoneConfig[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCoolingSectionStatus: any[]) => void;
}

function getTempStatus(
  newTemp: number,
  cargoType: string | undefined,
  palletsLoaded: number
): 'ok' | 'warn' | 'conflict' | 'empty' {
  if (!cargoType || palletsLoaded === 0) return 'empty';
  const range = CARGO_TEMP_RANGES[cargoType];
  if (!range) return 'empty';
  if (newTemp >= range.min && newTemp <= range.max) return 'ok';
  // Within 2°C of range = warn; further = conflict
  if (newTemp >= range.min - 2 && newTemp <= range.max + 2) return 'warn';
  return 'conflict';
}

function formatTemp(t: number) {
  return `${t > 0 ? '+' : ''}${t}°C`;
}

function TempStatusBadge({
  status,
  cargoType,
  newTemp,
}: {
  status: 'ok' | 'warn' | 'conflict' | 'empty';
  cargoType?: string;
  newTemp: number;
}) {
  if (status === 'empty') return null;
  const range = CARGO_TEMP_RANGES[cargoType!];
  if (status === 'ok') {
    return <span className={`${styles.statusBadge} ${styles.statusOk}`}>✓ in range</span>;
  }
  if (status === 'warn') {
    return (
      <span className={`${styles.statusBadge} ${styles.statusWarn}`}>
        ⚠ near limit ({formatTemp(range.min)} – {formatTemp(range.max)})
      </span>
    );
  }
  return (
    <span className={`${styles.statusBadge} ${styles.statusConflict}`}>
      ✗ outside range ({formatTemp(range.min)} – {formatTemp(range.max)})
    </span>
  );
}

export default function ConfigureZonesModal({
  planId,
  zones,
  isOpen,
  onClose,
  onSuccess,
}: ConfigureZonesModalProps) {
  const [draftTemps, setDraftTemps] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, number> = {};
      for (const z of zones) {
        initial[z.sectionId] = z.currentTemp;
      }
      setDraftTemps(initial);
      setReason('');
      setShowConfirm(false);
      setSaveError(null);
    }
  }, [isOpen, zones]);

  if (!isOpen) return null;

  // Zones where the new temp conflicts with assigned cargo
  const conflictingZones = zones.filter((z) => {
    const status = getTempStatus(
      draftTemps[z.sectionId] ?? z.currentTemp,
      z.assignedCargoType,
      z.palletsLoaded
    );
    return status === 'conflict';
  });

  // Zones where something actually changed
  const changedZones = zones.filter(
    (z) => (draftTemps[z.sectionId] ?? z.currentTemp) !== z.currentTemp
  );

  function handleTempChange(sectionId: string, raw: string) {
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      setDraftTemps((prev) => ({ ...prev, [sectionId]: val }));
    } else if (raw === '' || raw === '-') {
      // allow partial typing — keep previous
    }
  }

  function handleSaveClick() {
    setSaveError(null);
    if (changedZones.length === 0) {
      onClose();
      return;
    }
    if (conflictingZones.length > 0) {
      setShowConfirm(true);
    } else {
      void doSave();
    }
  }

  async function doSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updates = changedZones.map((z) => ({
        sectionId: z.sectionId,
        newTemp: draftTemps[z.sectionId] ?? z.currentTemp,
      }));

      const result = await updateZoneTemperatures({
        planId,
        updates,
        reason: reason.trim() || undefined,
      });

      if (!result.success) {
        setSaveError(result.error ?? 'Unknown error');
        setShowConfirm(false);
        return;
      }

      onSuccess(result.data?.coolingSectionStatus ?? []);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Configure Temperature Zones</h2>
            <p className={styles.modalSubtitle}>
              Changes are logged. Warnings shown when new temperature is incompatible with assigned cargo.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Zone table — hidden in confirm state */}
        {!showConfirm && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Compartments</th>
                    <th>Current</th>
                    <th>New Temp (°C)</th>
                    <th>Cargo / Status</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => {
                    const newTemp = draftTemps[z.sectionId] ?? z.currentTemp;
                    const status = getTempStatus(newTemp, z.assignedCargoType, z.palletsLoaded);
                    const changed = newTemp !== z.currentTemp;
                    return (
                      <tr key={z.sectionId} className={changed ? styles.rowChanged : undefined}>
                        <td>
                          <span className={styles.zoneName}>{z.zoneName}</span>
                        </td>
                        <td className={styles.cellMono}>{z.compartmentIds.join(', ')}</td>
                        <td className={styles.cellTemp}>{formatTemp(z.currentTemp)}</td>
                        <td>
                          <input
                            className={`${styles.tempInput} ${
                              status === 'conflict' ? styles.tempInputConflict :
                              status === 'warn'     ? styles.tempInputWarn : ''
                            }`}
                            type="number"
                            min={-25}
                            max={15}
                            step={1}
                            value={newTemp}
                            onChange={(e) => handleTempChange(z.sectionId, e.target.value)}
                          />
                        </td>
                        <td>
                          {z.assignedCargoType && z.palletsLoaded > 0 ? (
                            <div className={styles.cargoCell}>
                              <span className={styles.cargoLabel}>
                                {z.palletsLoaded} plt ·{' '}
                                {z.assignedCargoType.replace(/_/g, ' ').toLowerCase()}
                              </span>
                              <TempStatusBadge
                                status={status}
                                cargoType={z.assignedCargoType}
                                newTemp={newTemp}
                              />
                            </div>
                          ) : (
                            <span className={styles.cellMuted}>empty</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reason input */}
            <div className={styles.reasonRow}>
              <label className={styles.reasonLabel}>
                Reason for change
                <span className={styles.reasonOptional}>(optional)</span>
              </label>
              <input
                className={styles.reasonInput}
                type="text"
                placeholder="e.g. Compartment damage, cargo type change, captain request..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </div>
          </>
        )}

        {/* Confirmation step — shown when there are cargo conflicts */}
        {showConfirm && (
          <div className={styles.confirmSection}>
            <div className={styles.confirmWarning}>
              <span className={styles.confirmIcon}>⚠</span>
              <div>
                <p className={styles.confirmTitle}>Temperature conflict — confirm to save</p>
                <p className={styles.confirmSubtitle}>
                  The following zones have cargo assigned that falls outside the new temperature range.
                  The cargo will need to be reassigned or the booking updated after saving.
                </p>
              </div>
            </div>

            <div className={styles.conflictList}>
              {conflictingZones.map((z) => {
                const newTemp = draftTemps[z.sectionId] ?? z.currentTemp;
                const range = z.assignedCargoType ? CARGO_TEMP_RANGES[z.assignedCargoType] : null;
                return (
                  <div key={z.sectionId} className={styles.conflictRow}>
                    <span className={styles.conflictZone}>{z.zoneName}</span>
                    <span className={styles.conflictChange}>
                      {formatTemp(z.currentTemp)} → {formatTemp(newTemp)}
                    </span>
                    <span className={styles.conflictCargo}>
                      {z.palletsLoaded} plt ·{' '}
                      {z.assignedCargoType?.replace(/_/g, ' ').toLowerCase()}
                      {range && (
                        <span className={styles.conflictRange}>
                          {' '}(requires {formatTemp(range.min)} – {formatTemp(range.max)})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {saveError && (
          <div className={styles.errorBar}>{saveError}</div>
        )}

        {/* Footer */}
        <div className={styles.modalFooter}>
          {showConfirm ? (
            <>
              <button
                className={styles.btnGhost}
                onClick={() => setShowConfirm(false)}
                disabled={isSaving}
              >
                ← Go back
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => void doSave()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save anyway →'}
              </button>
            </>
          ) : (
            <>
              <button className={styles.btnGhost} onClick={onClose} disabled={isSaving}>
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveClick}
                disabled={isSaving || changedZones.length === 0}
              >
                {isSaving ? 'Saving…' : changedZones.length === 0 ? 'No changes' : `Save ${changedZones.length} zone${changedZones.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
