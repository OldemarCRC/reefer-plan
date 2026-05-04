'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addShipperToContract,
  toggleContractShipperActive,
  removeShipperFromContract,
  updateCounterpartyWeeklyPallets,
} from '@/app/actions/contract';
import styles from './page.module.css';


interface ShipperOption {
  id: string;
  name: string;
  code: string;
}

interface ContractCounterparty {
  shipperId?: string;
  shipperName: string;
  shipperCode: string;
  weeklyEstimate: number;
  active?: boolean;
}

interface ContractShippersPanelProps {
  contractId: string;
  contractActive: boolean;
  contractWeeklyPallets?: number;
  counterparties: ContractCounterparty[];
  availableShippers: ShipperOption[];
  canEdit: boolean;
  bookingCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Weekly capacity bar
// ---------------------------------------------------------------------------

function WeeklyCapacityBar({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  if (!total) return null;
  const pct = Math.min((used / total) * 100, 100);
  const isOver = used > total;
  const isExact = used === total && total > 0;

  return (
    <div className={`${styles.weeklyCapBar} ${isOver ? styles.weeklyCapBarOver : isExact ? styles.weeklyCapBarExact : ''}`}>
      <span>
        Active shippers:{' '}
        <strong className={isOver ? styles.weeklyCapOver : isExact ? styles.weeklyCapExact : ''}>
          {used}
        </strong>{' '}
        / {total} pallets/week
        {isOver && <span className={styles.weeklyCapOver}> — over contract capacity</span>}
        {isExact && <span className={styles.weeklyCapExact}> — at capacity</span>}
      </span>
      <div className={styles.weeklyCapBarFill}>
        <div
          className={styles.weeklyCapBarInner}
          style={{
            width: `${pct}%`,
            background: isOver ? 'var(--color-danger)' : isExact ? 'var(--color-success)' : 'var(--color-blue)',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function ContractShippersPanel({
  contractId,
  contractActive,
  contractWeeklyPallets = 0,
  counterparties,
  availableShippers,
  canEdit,
  bookingCounts,
}: ContractShippersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Local copy of counterparties — enables optimistic weeklyEstimate updates
  // without a server round-trip. Synced from props whenever the server refreshes.
  const [localCPs, setLocalCPs] = useState<ContractCounterparty[]>(counterparties);
  useEffect(() => { setLocalCPs(counterparties); }, [counterparties]);

  // Add form state
  const [addOpen, setAddOpen] = useState(false);
  const [selShipperId, setSelShipperId] = useState('');
  const [weeklyEst, setWeeklyEst] = useState(0);
  const [addError, setAddError] = useState('');

  // Inline edit state
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');

  // Derived from localCPs so the bar and unassigned list reflect optimistic updates
  const assignedIds   = new Set(localCPs.map((cp) => cp.shipperId).filter(Boolean));
  const assignedCodes = new Set(localCPs.map((cp) => cp.shipperCode));
  const unassigned    = availableShippers.filter(
    (s) => !assignedIds.has(s.id) && !assignedCodes.has(s.code)
  );

  const activeWeeklyTotal = localCPs
    .filter((cp) => cp.active !== false)
    .reduce((s, cp) => s + (cp.weeklyEstimate || 0), 0);

  const projectedTotal = activeWeeklyTotal + weeklyEst;

  function handleAdd() {
    if (!selShipperId) {
      setAddError('Select a shipper');
      return;
    }

    if (contractWeeklyPallets > 0 && projectedTotal > contractWeeklyPallets) {
      const confirmed = window.confirm(
        `Warning: Adding this shipper would bring the total to ${projectedTotal} pallets/week, ` +
        `which exceeds the contract capacity of ${contractWeeklyPallets}.\n\nAdd anyway?`
      );
      if (!confirmed) return;
    } else if (contractWeeklyPallets > 0 && projectedTotal === contractWeeklyPallets) {
      window.alert(
        `This brings the total to exactly ${contractWeeklyPallets} pallets/week — contract at full capacity.`
      );
    }

    setAddError('');
    startTransition(async () => {
      const res = await addShipperToContract(contractId, {
        shipperId: selShipperId,
        weeklyEstimate: weeklyEst,
      });
      if (res.success) {
        setAddOpen(false);
        setSelShipperId('');
        setWeeklyEst(0);
        setActionMsg({ type: 'success', text: res.message ?? 'Shipper added' });
        router.refresh();
      } else {
        setAddError(res.error ?? 'Failed to add shipper');
      }
    });
  }

  function handleToggle(shipperCode: string, currentActive: boolean) {
    setActionMsg(null);
    startTransition(async () => {
      const res = await toggleContractShipperActive(contractId, shipperCode, !currentActive);
      if (res.success) {
        setActionMsg({ type: 'success', text: res.message ?? 'Status updated' });
        router.refresh();
      } else {
        setActionMsg({ type: 'error', text: res.error ?? 'Failed to update status' });
      }
    });
  }

  function handleRemove(shipperCode: string, shipperName: string) {
    if (!confirm(`Remove ${shipperName} from this contract?\n\nThis is permanent. Use Deactivate if they have bookings.`)) {
      return;
    }
    setActionMsg(null);
    startTransition(async () => {
      const res = await removeShipperFromContract(contractId, shipperCode);
      if (res.success) {
        setActionMsg({ type: 'success', text: res.message ?? 'Shipper removed' });
        router.refresh();
      } else {
        setActionMsg({ type: 'error', text: res.error ?? 'Failed to remove' });
      }
    });
  }

  function startEdit(shipperCode: string, currentEstimate: number) {
    setEditingCode(shipperCode);
    setEditValue(String(currentEstimate));
    setEditError('');
    setActionMsg(null);
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditValue('');
    setEditError('');
  }

  function handleSaveEdit(shipperCode: string) {
    const parsed = parseInt(editValue, 10);
    if (isNaN(parsed) || parsed < 0) {
      setEditError('Enter a valid number (0 or more)');
      return;
    }
    if (parsed === 0) {
      const ok = window.confirm(
        'Setting weekly estimate to 0 means this shipper will not appear in voyage space forecasts. Continue?'
      );
      if (!ok) return;
    }
    setEditError('');
    startTransition(async () => {
      const res = await updateCounterpartyWeeklyPallets(contractId, shipperCode, parsed);
      if (res.success) {
        // Optimistic local update — cell reflects the new value immediately,
        // no server round-trip needed. localCPs will re-sync from props the
        // next time any other action triggers router.refresh().
        setLocalCPs((prev) =>
          prev.map((cp) =>
            cp.shipperCode === shipperCode ? { ...cp, weeklyEstimate: parsed } : cp
          )
        );
        setEditingCode(null);
        setEditValue('');
        setActionMsg({ type: 'success', text: res.message ?? 'Weekly estimate updated' });
      } else {
        setEditError(res.error ?? 'Failed to update');
      }
    });
  }

  // Whether clicking the Weekly Est. cell opens edit mode for a given row
  const cellClickable = contractActive && canEdit && !editingCode;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h2 className={styles.cardTitle} style={{ borderBottom: 'none', paddingBottom: 0 }}>
          Authorized Shippers
        </h2>
        {contractActive && !addOpen && (
          <button
            className={styles.btnPrimary}
            onClick={() => { setAddOpen(true); setActionMsg(null); }}
            disabled={isPending}
          >
            + Add Shipper
          </button>
        )}
      </div>

      {/* Weekly capacity bar */}
      <WeeklyCapacityBar used={activeWeeklyTotal} total={contractWeeklyPallets} />

      {actionMsg && (
        <p className={actionMsg.type === 'error' ? styles.msgError : styles.msgSuccess}>
          {actionMsg.text}
        </p>
      )}

      {localCPs.length === 0 ? (
        <p className={styles.emptyText}>
          No shippers assigned yet. Shippers are added after the consignee confirms them.
        </p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th className={styles.thRight}>Weekly Est.</th>
                <th>Status</th>
                {contractActive && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {localCPs.map((cp) => {
                const isActive      = cp.active !== false;
                const isEditingThis = editingCode === cp.shipperCode;
                const bookingCount  = bookingCounts[cp.shipperCode] ?? 0;

                return (
                  <tr key={cp.shipperCode} className={isActive ? '' : styles.shipperInactive}>
                    {/* Name + optional booking count badge */}
                    <td>
                      <span>{cp.shipperName}</span>
                      {bookingCount > 0 && (
                        <span className={styles.bookingCount}>
                          {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>

                    <td className={styles.cellMono}>{cp.shipperCode}</td>

                    {/* Weekly Est — click-to-edit when canEdit, inline input when editing */}
                    <td
                      className={
                        `${styles.cellRight}` +
                        (cellClickable && !isEditingThis ? ` ${styles.cellEditableValue}` : '')
                      }
                      onClick={cellClickable && !isEditingThis
                        ? () => startEdit(cp.shipperCode, cp.weeklyEstimate)
                        : undefined}
                      title={cellClickable && !isEditingThis ? 'Click to edit weekly estimate' : undefined}
                    >
                      {isEditingThis ? (
                        <div className={styles.inlineEditWrap}>
                          <input
                            type="number"
                            className={styles.inlineEditInput}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            min={0}
                            autoFocus
                            disabled={isPending}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter')  handleSaveEdit(cp.shipperCode);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          {editError && (
                            <span className={styles.inlineEditError}>{editError}</span>
                          )}
                        </div>
                      ) : (
                        cp.weeklyEstimate
                      )}
                    </td>

                    <td>
                      <span className={isActive ? styles.statusActive : styles.statusInactive}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {contractActive && (
                      <td>
                        <div className={styles.rowActions}>
                          {isEditingThis ? (
                            <>
                              <button
                                className={`${styles.btnSmall} ${styles.btnSaveEdit}`}
                                onClick={() => handleSaveEdit(cp.shipperCode)}
                                disabled={isPending}
                              >
                                Save
                              </button>
                              <button
                                className={`${styles.btnSmall} ${styles.btnCancelEdit}`}
                                onClick={cancelEdit}
                                disabled={isPending}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={`${styles.btnSmall} ${isActive ? styles.btnDeactivate : styles.btnReactivate}`}
                                onClick={() => handleToggle(cp.shipperCode, isActive)}
                                disabled={isPending || !!editingCode}
                              >
                                {isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                              <button
                                className={`${styles.btnSmall} ${styles.btnRemove}`}
                                onClick={() => handleRemove(cp.shipperCode, cp.shipperName)}
                                disabled={isPending || !!editingCode}
                                title="Remove only if no active bookings exist"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Shipper inline form */}
      {addOpen && (
        <div className={styles.addShipperForm}>
          <p className={styles.addShipperTitle}>Add Authorized Shipper</p>
          <p className={styles.addShipperHint}>
            Only shippers confirmed by the consignee should be added here.
          </p>

          {contractWeeklyPallets > 0 && selShipperId && (
            <WeeklyCapacityBar used={projectedTotal} total={contractWeeklyPallets} />
          )}

          <div className={styles.addFormRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Shipper</label>
              {unassigned.length === 0 ? (
                <p className={styles.emptyText}>All active shippers are already assigned.</p>
              ) : (
                <select
                  className={styles.formSelect}
                  value={selShipperId}
                  onChange={(e) => setSelShipperId(e.target.value)}
                  disabled={isPending}
                >
                  <option value="">Select shipper...</option>
                  {unassigned.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Weekly Estimate (pallets)</label>
              <input
                type="number"
                className={styles.formInput}
                min={0}
                value={weeklyEst}
                onChange={(e) => setWeeklyEst(parseInt(e.target.value) || 0)}
                disabled={isPending}
              />
            </div>
          </div>

          {addError && <p className={styles.msgError}>{addError}</p>}

          <div className={styles.formActions}>
            <button
              className={styles.btnModalCancel}
              onClick={() => { setAddOpen(false); setAddError(''); }}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={handleAdd}
              disabled={isPending || unassigned.length === 0}
            >
              {isPending ? 'Adding…' : 'Add Shipper'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
