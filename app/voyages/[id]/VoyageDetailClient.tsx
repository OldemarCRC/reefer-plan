'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { deleteVoyage, updatePortRotation, resequencePortCallsByEta } from '@/app/actions/voyage';
import { deleteStowagePlan, markCaptainResponse } from '@/app/actions/stowage-plan';
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
  ata?: string | null;
  atd?: string | null;
  operations: string[];
  locked?: boolean;
  status?: string;
}

interface ServicePort {
  portCode: string;
  portName: string;
  country: string;
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
// Plan Action Buttons (used in voyage detail plan list)
// Shows: Delete (draft) | Approved/Rejected (EMAIL_SENT) | nothing (locked/stevedore)
// ---------------------------------------------------------------------------

const SENT_OR_LOCKED_STATUSES = [
  'EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED',
  'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED',
];

const CAN_EDIT_ROLES = ['ADMIN', 'SHIPPING_PLANNER'];

// Captain response buttons — shown when plan is EMAIL_SENT and user can edit
function CaptainResponseButtons({ planId, planNumber, voyageId }: {
  planId: string; planNumber: string; voyageId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const respond = (response: 'CAPTAIN_APPROVED' | 'CAPTAIN_REJECTED') => {
    startTransition(async () => {
      const result = await markCaptainResponse(planId, response);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to record response');
      }
    });
  };

  return (
    <>
      <button
        className={clientStyles.btnApprove}
        onClick={() => respond('CAPTAIN_APPROVED')}
        disabled={isPending}
        title={`Mark plan ${planNumber} as approved by captain`}
      >
        ✓ Captain Approved
      </button>
      <button
        className={clientStyles.btnReject}
        onClick={() => respond('CAPTAIN_REJECTED')}
        disabled={isPending}
        title={`Mark plan ${planNumber} as rejected by captain`}
      >
        ✗ Rejected
      </button>
      {error && <span className={clientStyles.inlineError}>{error}</span>}
    </>
  );
}

/** @deprecated Use PlanActionButtons */
export function DeletePlanButton(props: {
  planId: string; planNumber: string; voyageId: string; planStatus: string;
}) {
  return <PlanActionButtons {...props} />;
}

export function PlanActionButtons({ planId, planNumber, voyageId, planStatus }: {
  planId: string;
  planNumber: string;
  voyageId: string;
  planStatus: string;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Only ADMIN and SHIPPING_PLANNER can take actions
  if (!CAN_EDIT_ROLES.includes(role)) return null;

  // Sent and awaiting captain response → show Approved / Rejected
  if (planStatus === 'EMAIL_SENT') {
    return <CaptainResponseButtons planId={planId} planNumber={planNumber} voyageId={voyageId} />;
  }

  // Any other locked status → no actions
  if (SENT_OR_LOCKED_STATUSES.includes(planStatus)) return null;

  // Draft / Estimated → show Delete
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

// Sort port calls by ETA ascending (CANCELLED go last, preserving their order)
function sortByEta(pcs: PortCallRow[]): PortCallRow[] {
  const scheduled = pcs
    .filter(p => p.status !== 'CANCELLED')
    .slice()
    .sort((a, b) => {
      const ta = a.eta ? new Date(a.eta).getTime() : Infinity;
      const tb = b.eta ? new Date(b.eta).getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      return (a.sequence ?? 0) - (b.sequence ?? 0);
    });
  const cancelled = pcs
    .filter(p => p.status === 'CANCELLED')
    .slice()
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return [...scheduled, ...cancelled];
}

export function PortCallsEditor({ voyageId, portCalls: initialPortCalls, servicePortRotation = [] }: {
  voyageId: string;
  portCalls: PortCallRow[];
  servicePortRotation?: ServicePort[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const canEdit = CAN_EDIT_ROLES.includes(session?.user?.role ?? '');
  const [portCalls, setPortCalls] = useState<PortCallRow[]>(initialPortCalls);

  // Inline edit state
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [editEta, setEditEta] = useState('');
  const [editEtd, setEditEtd] = useState('');
  const [editAta, setEditAta] = useState('');
  const [editAtd, setEditAtd] = useState('');
  const [ataError, setAtaError] = useState('');
  const [atdError, setAtdError] = useState('');
  const [editPortCode, setEditPortCode] = useState('');
  const [editPortName, setEditPortName] = useState('');
  const [editPortCountry, setEditPortCountry] = useState('');

  // Cancel port call modal
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Add port call form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPortCode, setAddPortCode] = useState('');
  const [addPortName, setAddPortName] = useState('');
  const [addPortCountry, setAddPortCountry] = useState('');
  const [addEta, setAddEta] = useState('');
  const [addEtd, setAddEtd] = useState('');
  const [addOperations, setAddOperations] = useState<('LOAD' | 'DISCHARGE')[]>(['LOAD']);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const toDateStr = (d: string | null | undefined) => {
    if (!d) return '';
    try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; }
  };

  const toDateTimeLocalStr = (d: string | null | undefined) => {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 16); } catch { return ''; }
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
    catch { return '—'; }
  };

  const formatDateTime = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return '—'; }
  };

  const clearFeedback = () => {
    setTimeout(() => { setError(null); setSuccessMsg(null); }, 4000);
  };

  const resetAddForm = () => {
    setAddPortCode('');
    setAddPortName('');
    setAddPortCountry('');
    setAddEta('');
    setAddEtd('');
    setAddOperations(['LOAD']);
  };

  // After any mutation that may affect order, re-fetch sequences from server
  const applyResequenced = async (fallback: PortCallRow[]) => {
    const r = await resequencePortCallsByEta(voyageId);
    setPortCalls(r.success ? r.portCalls : fallback);
  };

  // ---------------------------------------------------------------------------
  // Inline edit handlers
  // ---------------------------------------------------------------------------

  const startEditDates = (pc: PortCallRow) => {
    setEditingPort(pc.portCode);
    setEditMode('dates');
    setEditEta(toDateStr(pc.eta));
    setEditEtd(toDateStr(pc.etd));
    setEditAta(toDateTimeLocalStr(pc.ata));
    setEditAtd(toDateTimeLocalStr(pc.atd));
    setAtaError('');
    setAtdError('');
  };

  const startEditPort = (pc: PortCallRow) => {
    setEditingPort(pc.portCode);
    setEditMode('port');
    if (servicePortRotation.length > 0 &&
        servicePortRotation.some(sp => sp.portCode === pc.portCode)) {
      // Pre-select the matching service port
      setEditPortCode(pc.portCode);
      setEditPortName(pc.portName);
      setEditPortCountry(pc.country);
    } else {
      // Port not in service rotation — start unselected, user must pick
      setEditPortCode('');
      setEditPortName('');
      setEditPortCountry('');
    }
  };

  const cancelEdit = () => {
    setEditingPort(null);
    setEditMode(null);
    setAtaError('');
    setAtdError('');
  };

  // Save date change then resequence by ETA
  const saveDates = (portCode: string) => {
    if (editEta && editEtd && editEtd < editEta) {
      setError('ETD cannot be before ETA — vessel cannot depart before arriving');
      clearFeedback();
      return;
    }
    const now = new Date();
    if (editAta && new Date(editAta) > now) {
      setError('ATA cannot be in the future — actual arrival must have already occurred');
      clearFeedback();
      return;
    }
    if (editAtd && new Date(editAtd) > now) {
      setError('ATD cannot be in the future — actual departure must have already occurred');
      clearFeedback();
      return;
    }
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'DATE_CHANGED',
        portCode,
        eta: editEta || undefined,
        etd: editEtd || undefined,
        ata: editAta || undefined,
        atd: editAtd || undefined,
      }]);
      if (result.success) {
        setEditingPort(null);
        setEditMode(null);
        await applyResequenced(result.portCalls);
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

  // ---------------------------------------------------------------------------
  // Cancel / Restore
  // ---------------------------------------------------------------------------

  const cancelPort = (portCode: string) => {
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'CANCEL',
        portCode,
        reason: cancelReason || undefined,
      }]);
      if (result.success) {
        setPortCalls(result.portCalls);
        setShowCancelModal(null);
        setCancelReason('');
        setSuccessMsg('Port call cancelled');
        clearFeedback();
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to cancel port call');
        setShowCancelModal(null);
        clearFeedback();
      }
    });
  };

  const restorePort = (portCode: string) => {
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'RESTORE',
        portCode,
      }]);
      if (result.success) {
        await applyResequenced(result.portCalls);
        setSuccessMsg('Port call restored');
        clearFeedback();
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to restore port call');
        clearFeedback();
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Add Port Call
  // ---------------------------------------------------------------------------

  const addPort = () => {
    if (!addPortCode.trim()) {
      setError('Port code is required');
      clearFeedback();
      return;
    }
    if (addOperations.length === 0) {
      setError('Select at least one operation (LOAD or DISCHARGE)');
      clearFeedback();
      return;
    }
    if (addEta && addEtd && addEtd < addEta) {
      setError('ETD cannot be before ETA — vessel cannot depart before arriving');
      clearFeedback();
      return;
    }
    startTransition(async () => {
      const result = await updatePortRotation(voyageId, [{
        action: 'ADD',
        portCode: addPortCode.toUpperCase().trim(),
        portName: addPortName.trim() || addPortCode.toUpperCase().trim(),
        country: addPortCountry.trim(),
        eta: addEta || undefined,
        etd: addEtd || undefined,
        operations: addOperations,
      }]);
      if (result.success) {
        setShowAddForm(false);
        resetAddForm();
        await applyResequenced(result.portCalls);
        setSuccessMsg('Port call added');
        clearFeedback();
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to add port call');
        clearFeedback();
      }
    });
  };

  const toggleOperation = (op: 'LOAD' | 'DISCHARGE') => {
    setAddOperations(prev =>
      prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Display order: ETA ascending, CANCELLED last
  const sortedPCs = sortByEta(portCalls);
  const isAnyEditing = editingPort !== null;

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
            {sortedPCs.map((pc, idx) => {
              const isCancelled = pc.status === 'CANCELLED';
              const isEditing = editingPort === pc.portCode;
              const isLocked = pc.locked;

              return (
                <tr key={pc.portCode} className={isCancelled ? clientStyles.rowCancelled : ''}>

                  {/* Sequence */}
                  <td className={styles.cellMono}>{pc.sequence}</td>

                  {/* Port Code */}
                  <td className={styles.cellMono}>
                    {isEditing && editMode === 'port' ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, opacity: editPortCode ? 1 : 0.4 }}>
                        {editPortCode || '—'}
                      </span>
                    ) : (
                      pc.portCode
                    )}
                  </td>

                  {/* Port Name + Country */}
                  <td>
                    {isEditing && editMode === 'port' ? (
                      servicePortRotation.length > 0 ? (
                        <div className={clientStyles.portSelectWrapper}>
                          <select
                            className={clientStyles.portSelect}
                            value={editPortCode}
                            onChange={e => {
                              const sp = servicePortRotation.find(p => p.portCode === e.target.value);
                              if (sp) {
                                setEditPortCode(sp.portCode);
                                setEditPortName(sp.portName);
                                setEditPortCountry(sp.country);
                              }
                            }}
                          >
                            {!editPortCode && <option value="">— pick a port —</option>}
                            {servicePortRotation.map(sp => (
                              <option key={sp.portCode} value={sp.portCode}>
                                {sp.portCode} — {sp.portName}
                              </option>
                            ))}
                          </select>
                          {!editPortCode && (
                            <span className={clientStyles.portCustomHint}>
                              Port not in service rotation — go to Admin › Services to add it
                            </span>
                          )}
                        </div>
                      ) : (
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
                      )
                    ) : (
                      <div className={styles.portCell}>
                        <span>{pc.portName}</span>
                        {pc.country && <span className={styles.countryCode}>{pc.country}</span>}
                      </div>
                    )}
                  </td>

                  {/* ETA / ETD */}
                  {isEditing && editMode === 'dates' ? (
                    <>
                      <td>
                        <input
                          type="date"
                          className={clientStyles.dateInput}
                          value={editEta}
                          onChange={e => setEditEta(e.target.value)}
                        />
                        <div className={clientStyles.actualInputRow}>
                          <label className={clientStyles.actualLabel}>ATA</label>
                          <input
                            type="datetime-local"
                            className={clientStyles.dateTimeInput}
                            value={editAta}
                            max={new Date().toISOString().slice(0, 16)}
                            onChange={e => {
                              const val = e.target.value;
                              setEditAta(val);
                              if (val && new Date(val) > new Date()) {
                                setAtaError('ATA cannot be in the future');
                              } else {
                                setAtaError('');
                              }
                            }}
                          />
                        </div>
                        {ataError && <div className={clientStyles.actualError}>{ataError}</div>}
                      </td>
                      <td>
                        <input
                          type="date"
                          className={clientStyles.dateInput}
                          value={editEtd}
                          onChange={e => setEditEtd(e.target.value)}
                        />
                        <div className={clientStyles.actualInputRow}>
                          <label className={clientStyles.actualLabel}>ATD</label>
                          <input
                            type="datetime-local"
                            className={clientStyles.dateTimeInput}
                            value={editAtd}
                            max={new Date().toISOString().slice(0, 16)}
                            onChange={e => {
                              const val = e.target.value;
                              setEditAtd(val);
                              if (val && new Date(val) > new Date()) {
                                setAtdError('ATD cannot be in the future');
                              } else {
                                setAtdError('');
                              }
                            }}
                          />
                        </div>
                        {atdError && <div className={clientStyles.actualError}>{atdError}</div>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={styles.cellMono}>
                        {formatDate(pc.eta)}
                        {pc.ata && (
                          <div className={clientStyles.actualValue}>ATA {formatDateTime(pc.ata)}</div>
                        )}
                      </td>
                      <td className={styles.cellMono}>
                        {formatDate(pc.etd)}
                        {pc.atd && (
                          <div className={clientStyles.actualValue}>ATD {formatDateTime(pc.atd)}</div>
                        )}
                      </td>
                    </>
                  )}

                  {/* Operations */}
                  <td>
                    <div className={styles.opTags}>
                      {pc.operations.map((op: any) => (
                        <span key={op} className={styles.opTag} data-op={op}>
                          {op === 'LOAD' ? '▲' : '▼'} {op}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Status */}
                  <td>
                    {isCancelled ? (
                      <span className={clientStyles.cancelledBadge}>CANCELLED</span>
                    ) : isLocked ? (
                      <span className={styles.lockedBadge}>Locked</span>
                    ) : (
                      <span className={styles.cellMuted}>Scheduled</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    {!isLocked && canEdit && (
                      <div className={clientStyles.rowActions}>
                        {isEditing ? (
                          <>
                            <button
                              className={clientStyles.btnSave}
                              onClick={() => editMode === 'dates' ? saveDates(pc.portCode) : savePortChange(pc.portCode)}
                              disabled={isPending || !!ataError || !!atdError}
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
                        ) : isCancelled ? (
                          <button
                            className={clientStyles.btnRestore}
                            onClick={() => restorePort(pc.portCode)}
                            disabled={isPending}
                          >
                            Restore
                          </button>
                        ) : (
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
                            <button
                              className={clientStyles.btnCancelPort}
                              onClick={() => setShowCancelModal(pc.portCode)}
                              disabled={isPending || isAnyEditing}
                            >
                              Cancel
                            </button>
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

      {/* Add Port Call section — hidden for read-only roles */}
      <div className={clientStyles.addPortSection} style={canEdit ? undefined : { display: 'none' }}>
        {showAddForm ? (
          <div className={clientStyles.addPortForm}>
            <div className={clientStyles.addPortRow}>
              {servicePortRotation.length > 0 ? (
                <select
                  className={clientStyles.portSelect}
                  value={addPortCode}
                  onChange={e => {
                    const sp = servicePortRotation.find(p => p.portCode === e.target.value);
                    if (sp) {
                      setAddPortCode(sp.portCode);
                      setAddPortName(sp.portName);
                      setAddPortCountry(sp.country);
                    } else {
                      setAddPortCode('');
                      setAddPortName('');
                      setAddPortCountry('');
                    }
                  }}
                >
                  <option value="">— Select port —</option>
                  {servicePortRotation.map(sp => (
                    <option key={sp.portCode} value={sp.portCode}>
                      {sp.portCode} — {sp.portName}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    className={clientStyles.portCodeInput}
                    value={addPortCode}
                    onChange={e => setAddPortCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    maxLength={6}
                  />
                  <input
                    className={clientStyles.portNameInput}
                    value={addPortName}
                    onChange={e => setAddPortName(e.target.value)}
                    placeholder="Port name"
                  />
                  <input
                    className={clientStyles.portCountryInput}
                    value={addPortCountry}
                    onChange={e => setAddPortCountry(e.target.value.toUpperCase())}
                    placeholder="CC"
                    maxLength={2}
                  />
                </>
              )}
              <input
                type="date"
                className={clientStyles.dateInput}
                value={addEta}
                onChange={e => setAddEta(e.target.value)}
                title="ETA"
              />
              <input
                type="date"
                className={clientStyles.dateInput}
                value={addEtd}
                onChange={e => setAddEtd(e.target.value)}
                title="ETD"
              />
              <div className={clientStyles.opToggles}>
                <button
                  type="button"
                  className={addOperations.includes('LOAD') ? clientStyles.opToggleActive : clientStyles.opToggle}
                  onClick={() => toggleOperation('LOAD')}
                >
                  ▲ LOAD
                </button>
                <button
                  type="button"
                  className={addOperations.includes('DISCHARGE') ? clientStyles.opToggleActive : clientStyles.opToggle}
                  onClick={() => toggleOperation('DISCHARGE')}
                >
                  ▼ DISCH
                </button>
              </div>
            </div>
            <div className={clientStyles.addPortActions}>
              <button
                className={clientStyles.btnSave}
                onClick={addPort}
                disabled={isPending || !addPortCode.trim()}
              >
                {isPending ? 'Adding…' : 'Add Port Call'}
              </button>
              <button
                className={clientStyles.btnCancelEdit}
                onClick={() => { setShowAddForm(false); resetAddForm(); }}
                disabled={isPending}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <button
            className={clientStyles.btnAddPort}
            onClick={() => setShowAddForm(true)}
            disabled={isAnyEditing}
          >
            + Add Port Call
          </button>
        )}
      </div>

      {/* Cancel Port Call confirmation modal */}
      {showCancelModal && (
        <div className={clientStyles.modalOverlay} onClick={() => { if (!isPending) { setShowCancelModal(null); setCancelReason(''); } }}>
          <div className={clientStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={clientStyles.modalTitle}>Cancel Port Call</h3>
            <p className={clientStyles.modalBody}>
              Remove <strong>{showCancelModal}</strong> from this voyage&apos;s rotation?
              The port call will be kept for audit and shown as cancelled.
            </p>
            <div className={clientStyles.reasonRow}>
              <label className={clientStyles.reasonLabel}>Reason (optional)</label>
              <input
                type="text"
                className={clientStyles.reasonInput}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Port strike, bad weather, commercial change"
                maxLength={300}
                onKeyDown={e => { if (e.key === 'Enter') cancelPort(showCancelModal); }}
              />
            </div>
            <div className={clientStyles.modalActions}>
              <button
                className={clientStyles.btnModalCancel}
                onClick={() => { setShowCancelModal(null); setCancelReason(''); }}
                disabled={isPending}
              >
                Keep Port
              </button>
              <button
                className={clientStyles.btnModalConfirm}
                onClick={() => cancelPort(showCancelModal)}
                disabled={isPending}
              >
                {isPending ? 'Cancelling…' : 'Cancel Port Call'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
