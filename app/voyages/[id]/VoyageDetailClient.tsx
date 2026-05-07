'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { deleteVoyage, updatePortRotation, resequencePortCallsByEta, closeVoyage } from '@/app/actions/voyage';
import { updateBookingDestination } from '@/app/actions/booking';
import { deleteStowagePlan, markCaptainResponse } from '@/app/actions/stowage-plan';
import { createSpaceForecast, createContractDefaultForecasts, markForecastIncorporated } from '@/app/actions/space-forecast';
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
              <th>ATA <span style={{ fontSize: '9px', color: '#22c55e', display: 'block', fontWeight: 400 }}>actual</span></th>
              <th>ETD</th>
              <th>ATD <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block', fontWeight: 400 }}>actual</span></th>
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

                  {/* ETA | ATA | ETD | ATD — 4 separate columns */}
                  {isEditing && editMode === 'dates' ? (
                    <>
                      {/* ETA */}
                      <td>
                        <input
                          type="date"
                          className={clientStyles.dateInput}
                          value={editEta}
                          onChange={e => setEditEta(e.target.value)}
                        />
                      </td>
                      {/* ATA */}
                      <td>
                        <input
                          type="datetime-local"
                          className={clientStyles.dateTimeInput}
                          value={editAta}
                          min={editEta ? new Date(editEta).toISOString().slice(0, 16) : undefined}
                          max={new Date().toISOString().slice(0, 16)}
                          style={{ borderColor: ataError ? 'rgba(239,68,68,0.8)' : editAta ? 'rgba(34,197,94,0.7)' : undefined }}
                          onChange={e => {
                            const val = e.target.value;
                            setEditAta(val);
                            if (val && new Date(val) > new Date()) {
                              setAtaError('ATA cannot be in the future');
                            } else if (editEta && val && new Date(val) < new Date(editEta)) {
                              setAtaError('ATA cannot be before ETA');
                            } else {
                              setAtaError('');
                            }
                          }}
                        />
                        {ataError && <div className={clientStyles.actualError}>{ataError}</div>}
                      </td>
                      {/* ETD */}
                      <td>
                        <input
                          type="date"
                          className={clientStyles.dateInput}
                          value={editEtd}
                          onChange={e => setEditEtd(e.target.value)}
                        />
                      </td>
                      {/* ATD */}
                      <td>
                        <input
                          type="datetime-local"
                          className={clientStyles.dateTimeInput}
                          value={editAtd}
                          min={editAta ? new Date(editAta).toISOString().slice(0, 16) : editEta ? new Date(editEta).toISOString().slice(0, 16) : undefined}
                          max={new Date().toISOString().slice(0, 16)}
                          onChange={e => {
                            const val = e.target.value;
                            setEditAtd(val);
                            if (val && new Date(val) > new Date()) {
                              setAtdError('ATD cannot be in the future');
                            } else if (editAta && val && new Date(val) < new Date(editAta)) {
                              setAtdError('ATD cannot be before ATA');
                            } else if (!editAta && editEta && val && new Date(val) < new Date(editEta)) {
                              setAtdError('ATD cannot be before ETA');
                            } else {
                              setAtdError('');
                            }
                          }}
                        />
                        {atdError && <div className={clientStyles.actualError}>{atdError}</div>}
                      </td>
                    </>
                  ) : (
                    <>
                      {/* ETA */}
                      <td className={styles.cellMono}>{formatDate(pc.eta)}</td>
                      {/* ATA */}
                      <td>
                        {pc.ata ? (
                          <span className={clientStyles.ataValue}>{formatDateTime(pc.ata)}</span>
                        ) : pc.eta && new Date(pc.eta) < new Date() ? (
                          <span className={clientStyles.ataMissing} title="ATA not recorded">·</span>
                        ) : (
                          <span className={styles.cellMuted}>—</span>
                        )}
                      </td>
                      {/* ETD */}
                      <td className={styles.cellMono}>{formatDate(pc.etd)}</td>
                      {/* ATD */}
                      <td>
                        {pc.atd ? (
                          <span className={clientStyles.atdValue}>{formatDateTime(pc.atd)}</span>
                        ) : (
                          <span className={styles.cellMuted}>—</span>
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

// ---------------------------------------------------------------------------
// Close Voyage Button
// Shown on COMPLETED voyages for ADMIN / SHIPPING_PLANNER.
// Prompts for the ATD of the last port before sealing the voyage as CLOSED.
// ---------------------------------------------------------------------------

export function CloseVoyageButton({
  voyageId,
  voyageNumber,
  lastPortName,
}: {
  voyageId: string;
  voyageNumber: string;
  lastPortName: string;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [atd, setAtd] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Max value for the datetime input = now (no future ATDs)
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  function handleClose() {
    if (!atd) { setError('Please enter the ATD'); return; }
    setError(null);
    startTransition(async () => {
      const result = await closeVoyage(voyageId, new Date(atd));
      if (result.success) {
        router.push('/voyages');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to close voyage');
      }
    });
  }

  return (
    <>
      <button
        className={clientStyles.btnClose}
        onClick={() => { setShowModal(true); setAtd(''); setError(null); }}
      >
        Close Voyage
      </button>

      {showModal && (
        <div className={clientStyles.modalOverlay} onClick={() => { if (!isPending) setShowModal(false); }}>
          <div className={clientStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={clientStyles.modalTitle}>Close Voyage</h3>
            <p className={clientStyles.modalBody}>
              Closing <strong>{voyageNumber}</strong> seals it for statistics. No further edits will be
              allowed. Enter the actual departure time of the last port (<strong>{lastPortName}</strong>).
            </p>

            <div className={clientStyles.closeAtdRow}>
              <label className={clientStyles.closeAtdLabel}>
                ATD — {lastPortName}
              </label>
              <input
                type="datetime-local"
                className={clientStyles.dateInput}
                value={atd}
                max={nowLocal}
                onChange={e => setAtd(e.target.value)}
                disabled={isPending}
              />
            </div>

            {error && <p className={clientStyles.closeError}>{error}</p>}

            <div className={clientStyles.modalActions}>
              <button
                className={clientStyles.btnModalCancel}
                onClick={() => setShowModal(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className={clientStyles.btnClose}
                onClick={handleClose}
                disabled={isPending || !atd}
              >
                {isPending ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Change Destination Button
// Per-booking row button shown when voyage is IN_PROGRESS for ADMIN / PLANNER.
// ---------------------------------------------------------------------------

interface DischargePort {
  portCode: string;
  portName: string;
}

export function ChangeDestinationButton({
  bookingId,
  bookingNumber,
  currentPodCode,
  currentPodName,
  currentConsigneeName,
  dischargePorts,
}: {
  bookingId: string;
  bookingNumber: string;
  currentPodCode: string;
  currentPodName: string;
  currentConsigneeName: string;
  dischargePorts: DischargePort[];
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [podPortCode, setPodPortCode] = useState(currentPodCode);
  const [consigneeName, setConsigneeName] = useState(currentConsigneeName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedPort = dischargePorts.find(p => p.portCode === podPortCode);
  const podPortName = selectedPort?.portName ?? currentPodName;

  function openModal() {
    setPodPortCode(currentPodCode);
    setConsigneeName(currentConsigneeName);
    setError(null);
    setShowModal(true);
  }

  function handleSave() {
    if (!podPortCode || !consigneeName.trim()) {
      setError('POD port and consignee name are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBookingDestination(bookingId, {
        podPortCode,
        podPortName,
        consigneeName: consigneeName.trim(),
      });
      if (result.success) {
        setShowModal(false);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update destination');
      }
    });
  }

  return (
    <>
      <button
        className={clientStyles.btnChangeDest}
        onClick={openModal}
        title={`Change destination for ${bookingNumber}`}
      >
        Divert
      </button>

      {showModal && (
        <div className={clientStyles.modalOverlay} onClick={() => { if (!isPending) setShowModal(false); }}>
          <div className={clientStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={clientStyles.modalTitle}>Change Destination</h3>
            <p className={clientStyles.modalBody}>
              Booking <strong>{bookingNumber}</strong> — cargo is in transit.
              Update the discharge port and/or consignee below.
            </p>

            <div className={clientStyles.destFieldRow}>
              <label className={clientStyles.destLabel}>New POD</label>
              <select
                className={clientStyles.destSelect}
                value={podPortCode}
                onChange={e => setPodPortCode(e.target.value)}
                disabled={isPending}
              >
                {dischargePorts.length === 0 && (
                  <option value="">No discharge ports on this voyage</option>
                )}
                {dischargePorts.map(p => (
                  <option key={p.portCode} value={p.portCode}>
                    {p.portCode} — {p.portName}
                  </option>
                ))}
              </select>
            </div>

            <div className={clientStyles.destFieldRow}>
              <label className={clientStyles.destLabel}>Consignee</label>
              <input
                type="text"
                className={clientStyles.destInput}
                value={consigneeName}
                onChange={e => setConsigneeName(e.target.value)}
                disabled={isPending}
                maxLength={200}
              />
            </div>

            {error && <p className={clientStyles.closeError}>{error}</p>}

            <div className={clientStyles.modalActions}>
              <button
                className={clientStyles.btnModalCancel}
                onClick={() => setShowModal(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className={clientStyles.btnSave}
                onClick={handleSave}
                disabled={isPending || !podPortCode || !consigneeName.trim()}
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Unified Contracts & Space Panel
// ---------------------------------------------------------------------------

const BOOKING_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)'        },
  PENDING:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)'        },
  PARTIAL:   { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)'     },
  STANDBY:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)'        },
  REJECTED:  { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)'         },
  CANCELLED: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)'  },
};

interface ContractRow {
  rowId: string;
  contractId: string;
  contractNumber: string;
  cargoType: string;
  counterpartyWeeklyEstimate: number;
  counterpartyId: string;
  counterpartyCode: string;
  counterpartyName: string;
  shipperCode: string;
  shipperName: string;
  consigneeCode: string;
  consigneeName: string;
  clientType: 'SHIPPER' | 'CONSIGNEE';
  originPort: string;
  destinationPort: string;
  booking: any | null;
  forecast: any | null;
}

interface UnifiedContractsPanelProps {
  voyageId: string;
  voyageStatus: string;
  activeContracts: any[];
  bookings: any[];
  spaceForecasts: any[];
  canEdit: boolean;
  dischargePorts: { portCode: string; portName: string }[];
}

function buildContractRows(
  activeContracts: any[],
  bookings: any[],
  allForecasts: any[],
): ContractRow[] {
  const rows: ContractRow[] = [];
  for (const contract of activeContracts) {
    const clientType: 'SHIPPER' | 'CONSIGNEE' =
      contract.clientType ?? contract.client?.type ?? 'CONSIGNEE';
    const clientCode = contract.client?.code ?? '';
    const clientName = contract.client?.name ?? '';

    const counterparties: any[] = contract.counterparties ?? [];
    const activeCPs = counterparties.filter((cp: any) => cp.active !== false);
    const cps = activeCPs.length > 0 ? activeCPs : [{
      shipperId:     null,
      shipperCode:   '',
      shipperName:   clientName,
      weeklyEstimate: contract.weeklyPallets ?? 0,
    }];
    for (const cp of cps) {
      const cpCode = cp.shipperCode ?? cp.code ?? '';
      const cpName = cp.shipperName ?? cp.name ?? '';
      const cpId   = cp.shipperId?.toString() || cpCode || '';
      const rowId  = `${contract._id?.toString()}-${cpId}`;

      // Booking/forecast matching always uses counterparty data (unchanged logic)
      const booking = bookings.find((b: any) =>
        b.contractId?.toString() === contract._id?.toString() &&
        (b.shipper?.code === cpCode ||
         (cp.shipperId && b.shipperId?.toString() === cp.shipperId?.toString()))
      ) ?? null;
      const forecast = allForecasts.find((f: any) =>
        f.contractId?.toString() === contract._id?.toString() &&
        (cp.shipperId
          ? f.shipperId?.toString() === cp.shipperId?.toString()
          : f.shipperCode === cpCode)
      ) ?? null;

      // Resolve explicit shipper and consignee based on which side the client is
      const shipperCode   = clientType === 'SHIPPER'   ? clientCode : cpCode;
      const shipperName   = clientType === 'SHIPPER'   ? clientName : cpName;
      const consigneeCode = clientType === 'CONSIGNEE' ? clientCode : cpCode;
      const consigneeName = clientType === 'CONSIGNEE' ? clientName : cpName;

      rows.push({
        rowId,
        contractId:                 contract._id?.toString() ?? '',
        contractNumber:             contract.contractNumber ?? '',
        cargoType:                  (contract.cargoType ?? '').replace(/_/g, ' '),
        counterpartyWeeklyEstimate: cp.weeklyEstimate ?? 0,
        counterpartyId:             cp.shipperId?.toString() ?? '',
        counterpartyCode:           cpCode,
        counterpartyName:           cpName,
        shipperCode,
        shipperName,
        consigneeCode,
        consigneeName,
        clientType,
        originPort:      contract.originPort?.portCode || contract.originPortCode || '—',
        destinationPort: contract.destinationPort?.portCode || contract.destinationPortCode || '—',
        booking,
        forecast,
      });
    }
  }
  return rows;
}

export function UnifiedContractsPanel({
  voyageId,
  voyageStatus,
  activeContracts,
  bookings,
  spaceForecasts,
  canEdit,
  dischargePorts,
}: UnifiedContractsPanelProps) {
  const router = useRouter();
  const [allForecasts, setAllForecasts] = useState(spaceForecasts);
  const [openRowId, setOpenRowId]       = useState<string | null>(null);
  const [estimateValue, setEstimateValue] = useState('');
  const [isPending, startTransition]    = useTransition();
  const [rowError, setRowError]         = useState<string | null>(null);

  useEffect(() => {
    setAllForecasts(spaceForecasts);
  }, [spaceForecasts]);

  const rows          = buildContractRows(activeContracts, bookings, allForecasts);
  const bookingCount  = bookings.filter((b: any) => !['CANCELLED', 'REJECTED'].includes(b.status)).length;
  const estimateCount = rows.filter(r => {
    const f = r.forecast;
    if (!f) return false;
    if (f.source === 'NO_CARGO') return false;
    if (f.planImpact === 'SUPERSEDED' || f.planImpact === 'REPLACED_BY_BOOKING') return false;
    if (f.source === 'CONTRACT_DEFAULT') return true;
    return (f.estimatedPallets ?? 0) > 0;
  }).length;

  const canEnterForecasts = canEdit && ['PLANNED', 'IN_PROGRESS'].includes(voyageStatus);

  const handleUseContractEst = (contractId: string) => {
    startTransition(async () => {
      const result = await createContractDefaultForecasts(voyageId, contractId);
      if (result.success) {
        router.refresh();
      } else {
        setRowError((result as any).error ?? 'Failed to create contract default forecasts');
      }
    });
  };

  const handleConfirmEstimate = (forecastId: string) => {
    startTransition(async () => {
      const result = await markForecastIncorporated(forecastId, '');
      if (result.success) {
        setAllForecasts(prev =>
          prev.map((f: any) =>
            f._id?.toString() === forecastId
              ? { ...f, planImpact: 'INCORPORATED' }
              : f
          )
        );
      }
    });
  };

  const handleNoCargoDeclaration = (contractId: string, counterpartyId: string) => {
    setRowError(null);
    startTransition(async () => {
      const result = await createSpaceForecast({
        voyageId,
        contractId,
        estimatedPallets: 0,
        source: 'NO_CARGO',
      });
      if (result.success) {
        setAllForecasts(prev => {
          const filtered = prev.filter((f: any) =>
            !(f.contractId?.toString() === contractId &&
              f.shipperId?.toString() === counterpartyId)
          );
          return [...filtered, result.data];
        });
      } else {
        setRowError((result as any).error ?? 'Failed to declare no cargo');
      }
    });
  };

  const handleSaveEstimate = () => {
    const row = rows.find(r => r.rowId === openRowId);
    if (!row || !estimateValue) return;
    setRowError(null);
    startTransition(async () => {
      const result = await createSpaceForecast({
        voyageId,
        contractId:       row.contractId,
        estimatedPallets: parseInt(estimateValue, 10),
        source:           'PLANNER_ENTRY',
        shipperId:        row.counterpartyId,
        shipperCode:      row.shipperCode,
        shipperName:      row.shipperName,
        consigneeCode:    row.consigneeCode || 'N/A',
      });
      if (result.success) {
        setAllForecasts(prev => {
          const filtered = prev.filter((f: any) =>
            !(f.contractId?.toString() === row.contractId &&
              f.shipperId?.toString() === row.counterpartyId)
          );
          return [...filtered, result.data];
        });
        setOpenRowId(null);
        setEstimateValue('');
      } else {
        setRowError((result as any).error ?? 'Failed to save estimate');
      }
    });
  };

  return (
    <div className={clientStyles.forecastSection}>
      <div className={clientStyles.forecastHeader}>
        <div>
          <h2 className={clientStyles.forecastTitle}>Contracts &amp; Space</h2>
          <span className={clientStyles.forecastSubtitle}>
            {bookingCount} booking{bookingCount !== 1 ? 's' : ''} · {estimateCount} estimate{estimateCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {activeContracts.length === 0 ? (
        <p style={{ padding: 'var(--space-4) var(--space-5)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
          No active contracts found for this service.
        </p>
      ) : (
        <div className={clientStyles.forecastTableWrap}>
          <table className={clientStyles.forecastTable}>
            <thead>
              <tr>
                <th>Shipper</th>
                <th>Consignee</th>
                <th>Contract</th>
                <th>Route</th>
                <th>Cargo</th>
                <th className={clientStyles.thNum}>Booking / Weekly Est.</th>
                <th>Booking Nr. / Forecast</th>
                <th>Status</th>
                {canEnterForecasts && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const f = row.forecast;
                const b = row.booking;
                const isActiveBooking = b && !['CANCELLED', 'REJECTED'].includes(b.status);
                type RowState = 'booking' | 'replaced' | 'none' | 'default' | 'entry' | 'no_cargo';
                const state: RowState =
                  f?.planImpact === 'REPLACED_BY_BOOKING'                         ? 'replaced'  :
                  isActiveBooking                                                   ? 'booking'   :
                  f?.source === 'NO_CARGO'                                          ? 'no_cargo'  :
                  f?.source === 'CONTRACT_DEFAULT'                                  ? 'default'   :
                  f && ['PLANNER_ENTRY', 'SHIPPER_PORTAL'].includes(f.source)      ? 'entry'     :
                                                                                     'none';
                const bsStyle = b ? (BOOKING_STATUS_STYLES[b.status] ?? BOOKING_STATUS_STYLES.CANCELLED) : null;

                const qtyDisplay = (() => {
                  if ((state === 'booking' || state === 'replaced') && b) {
                    const qty = b.confirmedQuantity ?? b.requestedQuantity;
                    return qty != null ? `${qty} plt` : '—';
                  }
                  if ((state === 'entry' || state === 'default') && f) {
                    return `${f.estimatedPallets} plt`;
                  }
                  if (state === 'no_cargo') return '0 plt';
                  return row.counterpartyWeeklyEstimate > 0 ? `${row.counterpartyWeeklyEstimate} plt` : '—';
                })();

                return (
                  <React.Fragment key={row.rowId}>
                    <tr>
                      {/* Shipper — name only */}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {row.shipperName || '—'}
                        </div>
                      </td>

                      {/* Consignee */}
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {row.consigneeName || '—'}
                        </div>
                        {row.consigneeCode && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            {row.consigneeCode}
                          </div>
                        )}
                      </td>

                      {/* Contract */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {row.contractNumber}
                      </td>

                      {/* Route — port codes only */}
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {row.originPort} → {row.destinationPort}
                        </div>
                      </td>

                      {/* Cargo */}
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {row.cargoType || '—'}
                      </td>

                      {/* Booking / Weekly Est. */}
                      <td className={clientStyles.cellNum}>
                        {qtyDisplay}
                      </td>

                      {/* Booking Nr. / Forecast */}
                      <td>
                        {(state === 'booking' || state === 'replaced') && b && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-blue-light)' }}>
                            {b.bookingNumber}
                          </div>
                        )}
                        {state === 'entry' && f?.source === 'PLANNER_ENTRY' && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Planner Est.</span>
                        )}
                        {state === 'entry' && f?.source === 'SHIPPER_PORTAL' && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-cyan-light)' }}>Shipper Est.</span>
                        )}
                        {state === 'default' && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Contract Est.</span>
                        )}
                        {state === 'no_cargo' && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>No Cargo</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {(state === 'booking' || state === 'replaced') && b && bsStyle && (
                          <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: bsStyle.bg, color: bsStyle.color }}>
                            {b.status}
                          </span>
                        )}
                        {state === 'none' && (
                          <span className={clientStyles.badgeNoEst}>No Estimate</span>
                        )}
                        {state === 'default' && (
                          <span className={clientStyles.badgeIncorporated}>Incorporated</span>
                        )}
                        {state === 'entry' && f && (
                          <span className={f.planImpact === 'INCORPORATED' ? clientStyles.badgeIncorporated : clientStyles.badgePending}>
                            {f.planImpact === 'INCORPORATED' ? 'Incorporated' : 'Pending Review'}
                          </span>
                        )}
                        {state === 'no_cargo' && (
                          <span className={clientStyles.badgeNoCargo}>No Cargo</span>
                        )}
                      </td>

                      {/* Actions */}
                      {canEnterForecasts && (
                        <td>
                          <div className={clientStyles.forecastRowActions}>
                            {(state === 'none' || state === 'default' || state === 'entry') && (
                              <>
                                {state === 'none' && (
                                  <button
                                    className={clientStyles.btnUseContract}
                                    onClick={() => handleUseContractEst(row.contractId)}
                                    disabled={isPending || row.counterpartyWeeklyEstimate === 0}
                                    title={row.counterpartyWeeklyEstimate === 0 ? 'No weekly estimate for this shipper on the contract' : undefined}
                                  >
                                    Use Contract Est.
                                  </button>
                                )}
                                {(state === 'none' || state === 'default') && (
                                  <>
                                    <button
                                      className={clientStyles.btnEnterEst}
                                      onClick={() => {
                                        setOpenRowId(row.rowId);
                                        setEstimateValue('');
                                        setRowError(null);
                                      }}
                                      disabled={isPending}
                                    >
                                      Enter Estimate
                                    </button>
                                    <button
                                      className={clientStyles.btnNoCargo}
                                      onClick={() => handleNoCargoDeclaration(row.contractId, row.counterpartyId)}
                                      disabled={isPending}
                                    >
                                      No Cargo
                                    </button>
                                  </>
                                )}
                                {state === 'entry' && f && (
                                  <button
                                    className={clientStyles.btnEditEst}
                                    onClick={() => {
                                      setOpenRowId(row.rowId);
                                      setEstimateValue(String(f.estimatedPallets ?? ''));
                                      setRowError(null);
                                    }}
                                    disabled={isPending}
                                  >
                                    Edit
                                  </button>
                                )}
                                {state === 'entry' && f?.source === 'SHIPPER_PORTAL' &&
                                 f?.planImpact === 'PENDING_REVIEW' && (
                                  <button
                                    className={clientStyles.btnConfirmEst}
                                    onClick={() => handleConfirmEstimate(f._id?.toString() ?? '')}
                                    disabled={isPending}
                                    title="Mark shipper estimate as confirmed"
                                  >
                                    ✓ Confirm
                                  </button>
                                )}
                              </>
                            )}
                            {state === 'no_cargo' && (
                              <button
                                className={clientStyles.btnEditEst}
                                onClick={() => {
                                  setOpenRowId(row.rowId);
                                  setEstimateValue('');
                                  setRowError(null);
                                }}
                                disabled={isPending}
                              >
                                Edit
                              </button>
                            )}
                            {state === 'booking' && b && voyageStatus === 'IN_PROGRESS' && (
                              <ChangeDestinationButton
                                bookingId={b._id}
                                bookingNumber={b.bookingNumber}
                                currentPodCode={b.pod?.portCode ?? ''}
                                currentPodName={b.pod?.portName ?? ''}
                                currentConsigneeName={b.consignee?.name ?? ''}
                                dischargePorts={dischargePorts}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {openRowId === row.rowId && (
                      <tr>
                        <td colSpan={canEnterForecasts ? 9 : 8}>
                          <div className={clientStyles.inlineForm}>
                            <input
                              type="number"
                              min={1}
                              max={9999}
                              className={clientStyles.estimateInput}
                              value={estimateValue}
                              onChange={e => setEstimateValue(e.target.value)}
                              disabled={isPending}
                              autoFocus
                            />
                            <button
                              className={clientStyles.btnSaveEst}
                              onClick={handleSaveEstimate}
                              disabled={isPending || !estimateValue || parseInt(estimateValue, 10) === 0}
                            >
                              {isPending ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className={clientStyles.btnCancelEst}
                              onClick={() => { setOpenRowId(null); setRowError(null); }}
                            >
                              Cancel
                            </button>
                            {estimateValue !== '' && parseInt(estimateValue, 10) === 0 && (
                              <span className={clientStyles.inlineError}>
                                Use the No Cargo button to indicate no cargo — quantity must be greater than 0.
                              </span>
                            )}
                            {rowError && (
                              <span className={clientStyles.inlineError}>{rowError}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
