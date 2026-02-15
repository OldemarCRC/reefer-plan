'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteVoyage, updatePortRotation } from '@/app/actions/voyage';
import { deleteStowagePlan } from '@/app/actions/stowage-plan';
import styles from './page.module.css';
import clientStyles from './VoyageDetailClient.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortCallRow {
  portCode: string;
  portName: string;
  country: string;
  sequence: number;
  eta?: string | null;
  etd?: string | null;
  operations: string[];
  locked?: boolean;
  status?: string;
}

type EditMode = 'dates' | 'port' | null;

// ---------------------------------------------------------------------------
// Delete Voyage Button
// ---------------------------------------------------------------------------

export function DeleteVoyageButton({ voyageId, voyageNumber, voyageStatus }: {
  voyageId: string;
  voyageNumber: string;
  voyageStatus: string;
}) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCancelled = voyageStatus === 'CANCELLED';

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteVoyage(voyageId);
      if (result.success) {
        router.push('/voyages');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to cancel voyage');
        setShowConfirm(false);
      }
    });
  };

  if (isCancelled) return null;

  return (
    <>
      <button
        className={clientStyles.btnDanger}
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
      >
        Cancel Voyage
      </button>

      {error && (
        <div className={clientStyles.errorToast}>{error}</div>
      )}

      {showConfirm && (
        <div className={clientStyles.modalOverlay}>
          <div className={clientStyles.modal}>
            <h3 className={clientStyles.modalTitle}>Cancel Voyage</h3>
            <p className={clientStyles.modalBody}>
              Are you sure you want to cancel voyage <strong>{voyageNumber}</strong>?
              This sets the status to CANCELLED. All associated stowage plans and
              bookings must be removed first.
            </p>
            <div className={clientStyles.modalActions}>
              <button
                className={clientStyles.btnModalCancel}
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Keep Voyage
              </button>
              <button
                className={clientStyles.btnModalConfirm}
                onClick={handleDelete}
                disabled={isPending}
              >
                {isPending ? 'Cancelling…' : 'Yes, Cancel Voyage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Delete Stowage Plan Button (used in voyage detail plan list)
// ---------------------------------------------------------------------------

export function DeletePlanButton({ planId, planNumber, voyageId }: {
  planId: string;
  planNumber: string;
  voyageId: string;
}) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteStowagePlan(planId);
      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to delete plan');
        setShowConfirm(false);
      }
    });
  };

  return (
    <>
      <button
        className={clientStyles.btnDangerSm}
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        title="Delete stowage plan"
      >
        Delete
      </button>

      {error && <span className={clientStyles.inlineError}>{error}</span>}

      {showConfirm && (
        <div className={clientStyles.modalOverlay}>
          <div className={clientStyles.modal}>
            <h3 className={clientStyles.modalTitle}>Delete Stowage Plan</h3>
            <p className={clientStyles.modalBody}>
              Delete plan <strong>{planNumber}</strong>? This cannot be undone.
            </p>
            <div className={clientStyles.modalActions}>
              <button
                className={clientStyles.btnModalCancel}
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className={clientStyles.btnModalConfirm}
                onClick={handleDelete}
                disabled={isPending}
              >
                {isPending ? 'Deleting…' : 'Delete Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Port Calls Editor
// ---------------------------------------------------------------------------

export function PortCallsEditor({ voyageId, portCalls: initialPortCalls }: {
  voyageId: string;
  portCalls: PortCallRow[];
}) {
  const router = useRouter();
  const [portCalls, setPortCalls] = useState<PortCallRow[]>(initialPortCalls);
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);

  // Dates edit state
  const [editEta, setEditEta] = useState('');
  const [editEtd, setEditEtd] = useState('');

  // Change port state
  const [editPortCode, setEditPortCode] = useState('');
  const [editPortName, setEditPortName] = useState('');
  const [editPortCountry, setEditPortCountry] = useState('');

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const toDateStr = (d: string | null | undefined) => {
    if (!d) return '';
    try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; }
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
    catch { return '—'; }
  };

  const clearFeedback = () => {
    setTimeout(() => { setError(null); setSuccessMsg(null); }, 4000);
  };

  const startEditDates = (pc: PortCallRow) => {
    setEditingPort(pc.portCode);
    setEditMode('dates');
    setEditEta(toDateStr(pc.eta));
    setEditEtd(toDateStr(pc.etd));
  };

  const startEditPort = (pc: PortCallRow) => {
    setEditingPort(pc.portCode);
    setEditMode('port');
    setEditPortCode(pc.portCode);
    setEditPortName(pc.portName);
    setEditPortCountry(pc.country);
  };

  const cancelEdit = () => {
    setEditingPort(null);
    setEditMode(null);
  };

  const saveDates = (portCode: string) => {
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'DATE_CHANGED',
        portCode,
        eta: editEta || undefined,
        etd: editEtd || undefined,
      }]);
      if (result.success) {
        setPortCalls(result.portCalls);
        setEditingPort(null);
        setEditMode(null);
        setSuccessMsg('Dates updated');
        clearFeedback();
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update dates');
        clearFeedback();
      }
    });
  };

  const savePortChange = (currentPortCode: string) => {
    if (!editPortCode.trim()) {
      setError('Port code is required');
      clearFeedback();
      return;
    }
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'CHANGE_PORT',
        portCode: currentPortCode,
        newPortCode: editPortCode.toUpperCase().trim(),
        newPortName: editPortName.trim(),
        country: editPortCountry.trim(),
      }]);
      if (result.success) {
        setPortCalls(result.portCalls);
        setEditingPort(null);
        setEditMode(null);
        setSuccessMsg('Port updated');
        clearFeedback();
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update port');
        clearFeedback();
      }
    });
  };

  return (
    <div>
      {(error || successMsg) && (
        <div className={error ? clientStyles.errorToast : clientStyles.successToast}>
          {error ?? successMsg}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Code</th>
              <th>Port</th>
              <th>ETA</th>
              <th>ETD</th>
              <th>Operations</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {portCalls
              .slice()
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
              .map((pc) => {
                const isCancelled = pc.status === 'CANCELLED';
                const isEditing = editingPort === pc.portCode;
                const isLocked = pc.locked;

                return (
                  <tr key={pc.portCode} className={isCancelled ? clientStyles.rowCancelled : ''}>
                    <td className={styles.cellMono}>{pc.sequence}</td>

                    {/* Port Code — editable in CHANGE_PORT mode */}
                    <td className={styles.cellMono}>
                      {isEditing && editMode === 'port' ? (
                        <input
                          className={clientStyles.portCodeInput}
                          value={editPortCode}
                          onChange={e => setEditPortCode(e.target.value.toUpperCase())}
                          maxLength={6}
                          placeholder="XXXXX"
                        />
                      ) : (
                        pc.portCode
                      )}
                    </td>

                    {/* Port Name + Country — editable in CHANGE_PORT mode */}
                    <td>
                      {isEditing && editMode === 'port' ? (
                        <div className={clientStyles.portEditFields}>
                          <input
                            className={clientStyles.portNameInput}
                            value={editPortName}
                            onChange={e => setEditPortName(e.target.value)}
                            placeholder="Port name"
                          />
                          <input
                            className={clientStyles.portCountryInput}
                            value={editPortCountry}
                            onChange={e => setEditPortCountry(e.target.value.toUpperCase())}
                            maxLength={2}
                            placeholder="CC"
                          />
                        </div>
                      ) : (
                        <div className={styles.portCell}>
                          <span>{pc.portName}</span>
                          {pc.country && <span className={styles.countryCode}>{pc.country}</span>}
                        </div>
                      )}
                    </td>

                    {/* ETA / ETD — editable in dates mode */}
                    {isEditing && editMode === 'dates' ? (
                      <>
                        <td>
                          <input
                            type="date"
                            className={clientStyles.dateInput}
                            value={editEta}
                            onChange={e => setEditEta(e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className={clientStyles.dateInput}
                            value={editEtd}
                            onChange={e => setEditEtd(e.target.value)}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={styles.cellMono}>{formatDate(pc.eta)}</td>
                        <td className={styles.cellMono}>{formatDate(pc.etd)}</td>
                      </>
                    )}

                    <td>
                      <div className={styles.opTags}>
                        {pc.operations.map((op: string) => (
                          <span key={op} className={styles.opTag} data-op={op}>
                            {op === 'LOAD' ? '▲' : '▼'} {op}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td>
                      {isCancelled ? (
                        <span className={clientStyles.cancelledBadge}>CANCELLED</span>
                      ) : isLocked ? (
                        <span className={styles.lockedBadge}>Locked</span>
                      ) : (
                        <span className={styles.cellMuted}>Scheduled</span>
                      )}
                    </td>

                    <td>
                      {!isLocked && (
                        <div className={clientStyles.rowActions}>
                          {isEditing ? (
                            /* Save / cancel edit */
                            <>
                              <button
                                className={clientStyles.btnSave}
                                onClick={() => editMode === 'dates' ? saveDates(pc.portCode) : savePortChange(pc.portCode)}
                                disabled={isPending}
                              >
                                Save
                              </button>
                              <button
                                className={clientStyles.btnCancelEdit}
                                onClick={cancelEdit}
                                disabled={isPending}
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            /* Normal action buttons */
                            <>
                              {!isCancelled && (
                                <>
                                  <button
                                    className={clientStyles.btnEdit}
                                    onClick={() => startEditDates(pc)}
                                    disabled={isPending}
                                    title="Edit ETA/ETD"
                                  >
                                    📅
                                  </button>
                                  <button
                                    className={clientStyles.btnEdit}
                                    onClick={() => startEditPort(pc)}
                                    disabled={isPending}
                                    title="Change port"
                                  >
                                    ✎
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
