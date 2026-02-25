'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addShipperToContract,
  toggleContractShipperActive,
  removeShipperFromContract,
} from '@/app/actions/contract';
import styles from './page.module.css';

const ALL_CARGO_TYPES = [
  'BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'FROZEN_FISH', 'TABLE_GRAPES',
  'CITRUS', 'AVOCADOS', 'BERRIES', 'KIWIS', 'PINEAPPLES', 'CHERRIES',
  'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS', 'PAPAYA',
  'MANGOES', 'OTHER_FROZEN', 'OTHER_CHILLED',
] as const;

function formatCargo(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  cargoTypes: string[];
  active?: boolean;
}

interface ContractShippersPanelProps {
  contractId: string;
  contractActive: boolean;
  counterparties: ContractCounterparty[];
  availableShippers: ShipperOption[];
}

export default function ContractShippersPanel({
  contractId,
  contractActive,
  counterparties,
  availableShippers,
}: ContractShippersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Add form state
  const [addOpen, setAddOpen] = useState(false);
  const [selShipperId, setSelShipperId] = useState('');
  const [weeklyEst, setWeeklyEst] = useState(0);
  const [selCargoTypes, setSelCargoTypes] = useState<string[]>([]);
  const [addError, setAddError] = useState('');

  // Shippers not yet assigned (by id and code)
  const assignedIds = new Set(counterparties.map((cp) => cp.shipperId).filter(Boolean));
  const assignedCodes = new Set(counterparties.map((cp) => cp.shipperCode));
  const unassigned = availableShippers.filter(
    (s) => !assignedIds.has(s.id) && !assignedCodes.has(s.code)
  );

  function toggleCargo(ct: string) {
    setSelCargoTypes((prev) =>
      prev.includes(ct) ? prev.filter((x) => x !== ct) : [...prev, ct]
    );
  }

  function handleAdd() {
    if (!selShipperId) {
      setAddError('Select a shipper');
      return;
    }
    if (selCargoTypes.length === 0) {
      setAddError('Select at least one cargo type');
      return;
    }
    setAddError('');
    startTransition(async () => {
      const res = await addShipperToContract(contractId, {
        shipperId: selShipperId,
        weeklyEstimate: weeklyEst,
        cargoTypes: selCargoTypes,
      });
      if (res.success) {
        setAddOpen(false);
        setSelShipperId('');
        setWeeklyEst(0);
        setSelCargoTypes([]);
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

      {actionMsg && (
        <p className={actionMsg.type === 'error' ? styles.msgError : styles.msgSuccess}>
          {actionMsg.text}
        </p>
      )}

      {counterparties.length === 0 ? (
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
                <th>Cargo Types</th>
                <th>Status</th>
                {contractActive && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {counterparties.map((cp) => {
                const isActive = cp.active !== false;
                return (
                  <tr key={cp.shipperCode} className={isActive ? '' : styles.shipperInactive}>
                    <td>{cp.shipperName}</td>
                    <td className={styles.cellMono}>{cp.shipperCode}</td>
                    <td className={styles.cellRight}>{cp.weeklyEstimate}</td>
                    <td>
                      <div className={styles.cargoChips}>
                        {(cp.cargoTypes || []).map((ct) => (
                          <span key={ct} className={styles.cargoTag}>{formatCargo(ct)}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={isActive ? styles.statusActive : styles.statusInactive}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {contractActive && (
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            className={`${styles.btnSmall} ${isActive ? styles.btnDeactivate : styles.btnReactivate}`}
                            onClick={() => handleToggle(cp.shipperCode, isActive)}
                            disabled={isPending}
                          >
                            {isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            className={`${styles.btnSmall} ${styles.btnRemove}`}
                            onClick={() => handleRemove(cp.shipperCode, cp.shipperName)}
                            disabled={isPending}
                            title="Remove only if no active bookings exist"
                          >
                            Remove
                          </button>
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

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Authorized Cargo Types</label>
            <div className={styles.cargoGrid}>
              {ALL_CARGO_TYPES.map((ct) => (
                <label key={ct} className={styles.cargoCheckbox}>
                  <input
                    type="checkbox"
                    checked={selCargoTypes.includes(ct)}
                    onChange={() => toggleCargo(ct)}
                    disabled={isPending}
                  />
                  {formatCargo(ct)}
                </label>
              ))}
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
