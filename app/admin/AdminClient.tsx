'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cancelVoyage, hardDeleteVoyage } from '@/app/actions/voyage';
import { deleteStowagePlan } from '@/app/actions/stowage-plan';
import { deleteVessel } from '@/app/actions/vessel';
import { deleteService, createService, updateService } from '@/app/actions/service';
import ContractsClient from '@/app/contracts/ContractsClient';
import type { DisplayContract } from '@/app/contracts/ContractsClient';
import styles from './page.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminVoyage {
  _id: string;
  voyageNumber: string;
  status: string;
  departureDate?: string;
  arrivalDate?: string;
  weekNumber?: number;
  planCount: number;
  bookingCount: number;
  vesselId?: { name?: string; imoNumber?: string };
  serviceId?: { serviceCode?: string; serviceName?: string };
}

interface AdminPlan {
  _id: string;
  planNumber: string;
  status: string;
  createdAt?: string;
  cargoPositionCount: number;
  voyageRawId?: string | null;
  vesselId?: { name?: string };
  voyageId?: { voyageNumber?: string; departureDate?: string; weekNumber?: number };
}

interface AdminVessel {
  _id: string;
  name: string;
  imoNumber?: string;
  flag?: string;
  capacity?: { totalPallets?: number };
  active?: boolean;
  voyageCount: number;
}

interface AdminService {
  _id: string;
  serviceCode: string;
  shortCode?: string;
  serviceName: string;
  frequency?: string;
  cycleDurationWeeks?: number;
  active: boolean;
  portRotation: Array<{
    portCode: string;
    portName: string;
    country: string;
    sequence: number;
    weeksFromStart: number;
    operations: string[];
  }>;
}

interface PortEntry {
  portCode: string;
  portName: string;
  country: string;
  operations: ('LOAD' | 'DISCHARGE')[];
  weeksFromStart: number;
}

type Tab = 'voyages' | 'contracts' | 'plans' | 'vessels' | 'services' | 'users';

type ConfirmAction =
  | { type: 'cancel'; voyage: AdminVoyage }
  | { type: 'hard-delete'; voyage: AdminVoyage }
  | null;

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  IN_PROGRESS:  { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  CONFIRMED:    { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PLANNED:      { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)' },
  ESTIMATED:    { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  COMPLETED:    { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
  CANCELLED:    { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: s.bg, color: s.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------

function ConfirmModal({
  action,
  onConfirm,
  onClose,
  isPending,
  errorMsg,
}: {
  action: ConfirmAction;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
  errorMsg: string | null;
}) {
  if (!action) return null;

  const isDelete = action.type === 'hard-delete';
  const v = action.voyage;
  const vesselName = v.vesselId?.name ?? '—';
  const canDelete = v.planCount === 0 && v.bookingCount === 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>
          {isDelete ? '⚠ Permanently Delete Voyage' : 'Cancel Voyage'}
        </h3>

        <div className={styles.modalVoyageInfo}>
          <span className={styles.modalVoyageNumber}>{v.voyageNumber}</span>
          <StatusBadge status={v.status} />
        </div>

        <div className={styles.modalMeta}>
          <span>{vesselName}</span>
          <span>·</span>
          <span>{v.serviceId?.serviceCode ?? '—'}</span>
          <span>·</span>
          <span>Dep. {fmtDate(v.departureDate)}</span>
        </div>

        {isDelete && !canDelete && (
          <div className={styles.modalBlocker}>
            <strong>Cannot delete:</strong>{' '}
            {[
              v.planCount > 0 && `${v.planCount} stowage plan${v.planCount > 1 ? 's' : ''}`,
              v.bookingCount > 0 && `${v.bookingCount} booking${v.bookingCount > 1 ? 's' : ''}`,
            ]
              .filter(Boolean)
              .join(' and ')}{' '}
            must be removed first.
          </div>
        )}

        {isDelete && canDelete && (
          <p className={styles.modalBody}>
            This will <strong>permanently remove</strong> the voyage from the database.
            This action cannot be undone.
          </p>
        )}

        {!isDelete && (
          <p className={styles.modalBody}>
            This sets the voyage status to <strong>CANCELLED</strong>. The record is
            preserved for audit and reporting. Associated plans and bookings are not affected.
          </p>
        )}

        {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          {(!isDelete || canDelete) && (
            <button
              className={isDelete ? styles.btnModalDanger : styles.btnModalWarn}
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending
                ? isDelete ? 'Deleting…' : 'Cancelling…'
                : isDelete ? 'Yes, Delete Permanently' : 'Yes, Cancel Voyage'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voyages Tab
// ---------------------------------------------------------------------------

function VoyagesTab({ initialVoyages }: { initialVoyages: AdminVoyage[] }) {
  const router = useRouter();
  const [voyages, setVoyages] = useState<AdminVoyage[]>(initialVoyages);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = statusFilter === 'ALL'
    ? voyages
    : voyages.filter((v: any) => v.status === statusFilter);

  const allStatuses = ['ALL', ...Array.from(new Set(voyages.map((v: any) => v.status))).sort()];

  const handleConfirm = () => {
    if (!confirmAction) return;
    setErrorMsg(null);

    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (confirmAction.type === 'hard-delete') {
        result = await hardDeleteVoyage(confirmAction.voyage._id);
        if (result.success) {
          setVoyages((prev: any) => prev.filter((v: any) => v._id !== confirmAction.voyage._id));
          setConfirmAction(null);
          return;
        }
      } else {
        result = await cancelVoyage(confirmAction.voyage._id);
        if (result.success) {
          setVoyages((prev: any) =>
            prev.map((v: any) => v._id === confirmAction.voyage._id ? { ...v, status: 'CANCELLED' } : v)
          );
          setConfirmAction(null);
          router.refresh();
          return;
        }
      }

      setErrorMsg(result.error ?? 'Operation failed');
    });
  };

  return (
    <div className={styles.tabContent}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{filtered.length} voyages</span>
          <div className={styles.filterGroup}>
            {allStatuses.map((s: any) => (
              <button
                key={s}
                className={`${styles.filterChip} ${statusFilter === s ? styles['filterChip--active'] : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
                <span className={styles.chipCount}>
                  {s === 'ALL' ? voyages.length : voyages.filter((v: any) => v.status === s).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Voyage #</th>
              <th>Vessel</th>
              <th>Service</th>
              <th>Status</th>
              <th>Departure</th>
              <th className={styles.thNum}>Plans</th>
              <th className={styles.thNum}>Bookings</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>No voyages found.</td>
              </tr>
            ) : (
              filtered.map((v: any) => {
                const isCancelled = v.status === 'CANCELLED';
                const canHardDelete = v.planCount === 0 && v.bookingCount === 0;
                return (
                  <tr key={v._id} className={isCancelled ? styles.rowCancelled : ''}>
                    <td>
                      <Link href={`/voyages/${v._id}`} className={styles.voyageLink}>
                        {v.voyageNumber}
                      </Link>
                      {v.weekNumber != null && (
                        <span className={styles.wkBadge}>WK{String(v.weekNumber).padStart(2, '0')}</span>
                      )}
                    </td>
                    <td className={styles.cellSecondary}>{v.vesselId?.name ?? '—'}</td>
                    <td className={styles.cellSecondary}>{v.serviceId?.serviceCode ?? '—'}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td className={styles.cellMono}>{fmtDate(v.departureDate)}</td>
                    <td className={`${styles.cellNum} ${v.planCount > 0 ? styles.countNonZero : styles.countZero}`}>
                      {v.planCount}
                    </td>
                    <td className={`${styles.cellNum} ${v.bookingCount > 0 ? styles.countNonZero : styles.countZero}`}>
                      {v.bookingCount}
                    </td>
                    <td className={styles.cellActions}>
                      {!isCancelled && (
                        <button
                          className={styles.btnWarn}
                          onClick={() => setConfirmAction({ type: 'cancel', voyage: v })}
                          title="Soft cancel — keeps record for audit"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className={`${styles.btnDanger} ${!canHardDelete ? styles.btnBlocked : ''}`}
                        onClick={() => setConfirmAction({ type: 'hard-delete', voyage: v })}
                        title={canHardDelete
                          ? 'Permanently remove from database'
                          : `Blocked: ${v.planCount > 0 ? `${v.planCount} plan(s)` : ''}${v.planCount > 0 && v.bookingCount > 0 ? ', ' : ''}${v.bookingCount > 0 ? `${v.bookingCount} booking(s)` : ''} must be removed first`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        action={confirmAction}
        onConfirm={handleConfirm}
        onClose={() => { setConfirmAction(null); setErrorMsg(null); }}
        isPending={isPending}
        errorMsg={errorMsg}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans Tab
// ---------------------------------------------------------------------------

const PLAN_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ESTIMATED:           { bg: 'var(--color-blue-muted)',    color: 'var(--color-blue-light)' },
  DRAFT:               { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  READY_FOR_CAPTAIN:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  EMAIL_SENT:          { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  CAPTAIN_APPROVED:    { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  CAPTAIN_REJECTED:    { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  IN_REVISION:         { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  READY_FOR_EXECUTION: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  IN_EXECUTION:        { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  COMPLETED:           { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
  CANCELLED:           { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
};

function PlansTab({ initialPlans }: { initialPlans: AdminPlan[] }) {
  const router = useRouter();
  const [plans, setPlans] = useState<AdminPlan[]>(initialPlans);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirmPlan = plans.find(p => p._id === confirmId);

  // Compute which plan is the latest (highest planNumber) per voyage.
  // Only the latest plan can be deleted to prevent sequential numbering gaps.
  const deletablePlanIds: Set<string> = (() => {
    const latestByVoyage = new Map<string, AdminPlan>();
    for (const p of plans) {
      const key = p.voyageRawId ?? p._id; // plans without a voyage key are self-keyed
      const current = latestByVoyage.get(key);
      if (!current || (p.planNumber ?? '') > (current.planNumber ?? '')) {
        latestByVoyage.set(key, p);
      }
    }
    return new Set(Array.from(latestByVoyage.values()).map(p => p._id));
  })();

  const handleDelete = () => {
    if (!confirmId) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteStowagePlan(confirmId);
      if (result.success) {
        setPlans(prev => prev.filter(p => p._id !== confirmId));
        setConfirmId(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Delete failed');
      }
    });
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{plans.length} stowage plans</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Plan Number</th>
              <th>Vessel</th>
              <th>Voyage</th>
              <th>Status</th>
              <th className={styles.thNum}>Cargo Positions</th>
              <th>Created</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyCell}>No stowage plans found.</td></tr>
            ) : (
              plans.map(p => {
                const sc = PLAN_STATUS_COLORS[p.status] ?? { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
                const wk = p.voyageId?.weekNumber != null
                  ? `WK${String(p.voyageId.weekNumber).padStart(2, '0')} · `
                  : '';
                return (
                  <tr key={p._id}>
                    <td>
                      <Link href={`/stowage-plans/${p._id}`} className={styles.voyageLink}>
                        {p.planNumber}
                      </Link>
                    </td>
                    <td className={styles.cellSecondary}>{p.vesselId?.name ?? '—'}</td>
                    <td className={styles.cellSecondary}>
                      {wk}{p.voyageId?.voyageNumber ?? '—'}
                    </td>
                    <td>
                      <span className={styles.badge} style={{ background: sc.bg, color: sc.color }}>
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`${styles.cellNum} ${p.cargoPositionCount > 0 ? styles.countNonZero : styles.countZero}`}>
                      {p.cargoPositionCount}
                    </td>
                    <td className={styles.cellMono}>{fmtDate(p.createdAt)}</td>
                    <td className={styles.cellActions}>
                      {deletablePlanIds.has(p._id) ? (
                        <button
                          className={styles.btnDanger}
                          onClick={() => { setConfirmId(p._id); setErrorMsg(null); }}
                        >
                          Delete
                        </button>
                      ) : (
                        <span
                          className={styles.cellSecondary}
                          style={{ fontSize: 'var(--text-xs)', fontStyle: 'italic' }}
                          title="Newer plans exist — delete them first"
                        >
                          newer plan exists
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmPlan && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>⚠ Delete Stowage Plan</h3>
            <div className={styles.modalVoyageInfo}>
              <span className={styles.modalVoyageNumber}>{confirmPlan.planNumber}</span>
            </div>
            <p className={styles.modalBody}>
              This will <strong>permanently remove</strong> the plan from the database.
              This action cannot be undone.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmId(null)} disabled={isPending}>
                Cancel
              </button>
              <button className={styles.btnModalDanger} onClick={handleDelete} disabled={isPending}>
                {isPending ? 'Deleting…' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vessels Tab
// ---------------------------------------------------------------------------

function VesselsTab({ initialVessels }: { initialVessels: AdminVessel[] }) {
  const router = useRouter();
  const [vessels, setVessels] = useState<AdminVessel[]>(initialVessels);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirmVessel = vessels.find(v => v._id === confirmId);

  const handleDelete = () => {
    if (!confirmId) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteVessel(confirmId);
      if (result.success) {
        setVessels(prev => prev.filter(v => v._id !== confirmId));
        setConfirmId(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Delete failed');
      }
    });
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{vessels.length} vessels</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Vessel Name</th>
              <th>IMO</th>
              <th>Flag</th>
              <th className={styles.thNum}>Pallets</th>
              <th className={styles.thNum}>Voyages</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vessels.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyCell}>No vessels found.</td></tr>
            ) : (
              vessels.map(v => {
                const canDelete = v.voyageCount === 0;
                return (
                  <tr key={v._id}>
                    <td>
                      <Link href={`/vessels/${v._id}`} className={styles.voyageLink}>
                        {v.name}
                      </Link>
                    </td>
                    <td className={styles.cellMono}>{v.imoNumber ?? '—'}</td>
                    <td className={styles.cellSecondary}>{v.flag ?? '—'}</td>
                    <td className={`${styles.cellNum} ${styles.countNonZero}`}>
                      {v.capacity?.totalPallets?.toLocaleString() ?? '—'}
                    </td>
                    <td className={`${styles.cellNum} ${v.voyageCount > 0 ? styles.countNonZero : styles.countZero}`}>
                      {v.voyageCount}
                    </td>
                    <td className={styles.cellActions}>
                      <button
                        className={`${styles.btnDanger} ${!canDelete ? styles.btnBlocked : ''}`}
                        onClick={() => { setConfirmId(v._id); setErrorMsg(null); }}
                        title={canDelete
                          ? 'Permanently remove vessel from database'
                          : `Blocked: ${v.voyageCount} voyage${v.voyageCount > 1 ? 's' : ''} must be removed first`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmVessel && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>⚠ Delete Vessel</h3>
            <div className={styles.modalVoyageInfo}>
              <span className={styles.modalVoyageNumber}>{confirmVessel.name}</span>
              {confirmVessel.imoNumber && (
                <span className={styles.cellMono} style={{ fontSize: '0.8em', opacity: 0.7 }}>
                  IMO {confirmVessel.imoNumber}
                </span>
              )}
            </div>
            {confirmVessel.voyageCount > 0 ? (
              <div className={styles.modalBlocker}>
                <strong>Cannot delete:</strong>{' '}
                {confirmVessel.voyageCount} voyage{confirmVessel.voyageCount > 1 ? 's' : ''} must be removed first.
              </div>
            ) : (
              <p className={styles.modalBody}>
                This will <strong>permanently remove</strong> the vessel from the database.
                This action cannot be undone.
              </p>
            )}
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmId(null)} disabled={isPending}>
                Cancel
              </button>
              {confirmVessel.voyageCount === 0 && (
                <button className={styles.btnModalDanger} onClick={handleDelete} disabled={isPending}>
                  {isPending ? 'Deleting…' : 'Yes, Delete Permanently'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Port Rotation Editor — shared by Create and Edit service modals
// ---------------------------------------------------------------------------

function PortRotationEditor({ ports, onChange }: {
  ports: PortEntry[];
  onChange: (ports: PortEntry[]) => void;
}) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newOps, setNewOps] = useState<('LOAD' | 'DISCHARGE')[]>(['LOAD']);
  const [addErr, setAddErr] = useState('');

  const toggleOp = (op: 'LOAD' | 'DISCHARGE') =>
    setNewOps(prev => prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]);

  const addPort = () => {
    if (!newCode.trim() || !newName.trim() || !newCountry.trim()) {
      setAddErr('Port code, name and country are required');
      return;
    }
    if (newOps.length === 0) { setAddErr('Select at least one operation'); return; }
    const code = newCode.toUpperCase().trim();
    if (ports.some(p => p.portCode === code)) { setAddErr('Port already in list'); return; }
    onChange([...ports, { portCode: code, portName: newName.trim(), country: newCountry.toUpperCase().trim(), operations: newOps, weeksFromStart: ports.length }]);
    setNewCode(''); setNewName(''); setNewCountry(''); setNewOps(['LOAD']); setAddErr('');
  };

  return (
    <div>
      {ports.length === 0 ? (
        <p className={styles.portEmptyHint}>No ports yet — add at least 2 below.</p>
      ) : (
        <div className={styles.portList}>
          {ports.map((p, i) => (
            <div key={p.portCode} className={styles.portListItem}>
              <span className={styles.portListSeq}>{i + 1}</span>
              <span className={styles.portListCode}>{p.portCode}</span>
              <span className={styles.portListName}>{p.portName}</span>
              <span className={styles.portListCountry}>{p.country}</span>
              <div className={styles.portListOps}>
                {p.operations.map(op => (
                  <span
                    key={op}
                    className={`${styles.portListOp} ${op === 'LOAD' ? styles.portListOpLoad : styles.portListOpDischarge}`}
                  >
                    {op === 'LOAD' ? '▲ L' : '▼ D'}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className={styles.btnRemovePort}
                onClick={() => onChange(ports.filter(x => x.portCode !== p.portCode))}
                title="Remove port"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.portAddForm}>
        <div className={styles.portAddRow}>
          <input
            className={`${styles.portAddInput} ${styles.portAddInputCode}`}
            value={newCode}
            onChange={e => { setNewCode(e.target.value.toUpperCase()); setAddErr(''); }}
            placeholder="CODE"
            maxLength={6}
          />
          <input
            className={`${styles.portAddInput} ${styles.portAddInputName}`}
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddErr(''); }}
            placeholder="Port name"
          />
          <input
            className={`${styles.portAddInput} ${styles.portAddInputCC}`}
            value={newCountry}
            onChange={e => { setNewCountry(e.target.value.toUpperCase()); setAddErr(''); }}
            placeholder="CC"
            maxLength={2}
          />
          <div className={styles.opToggles}>
            {(['LOAD', 'DISCHARGE'] as const).map(op => (
              <button
                key={op}
                type="button"
                className={newOps.includes(op) ? styles.opToggleActive : styles.opToggle}
                onClick={() => toggleOp(op)}
              >
                {op === 'LOAD' ? '▲ L' : '▼ D'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.btnSm}
            onClick={addPort}
            disabled={!newCode.trim()}
          >
            + Add
          </button>
        </div>
        {addErr && <span className={styles.portAddError}>{addErr}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Service Modal
// ---------------------------------------------------------------------------

function CreateServiceModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (s: AdminService) => void;
}) {
  const [serviceCode, setServiceCode] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [cycleDurationWeeks, setCycleDurationWeeks] = useState(4);
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!serviceCode.trim() || !serviceName.trim()) {
      setError('Service code and name are required');
      return;
    }
    if (ports.length < 2) {
      setError('At least 2 ports are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const portRotation = ports.map((p, i) => ({
        portCode: p.portCode,
        portName: p.portName,
        country: p.country,
        sequence: i + 1,
        weeksFromStart: p.weeksFromStart,
        operations: p.operations,
      }));
      const result = await createService({
        serviceCode: serviceCode.toUpperCase().trim(),
        shortCode: shortCode.toUpperCase().trim() || undefined,
        serviceName: serviceName.trim(),
        frequency,
        cycleDurationWeeks,
        portRotation,
      });
      if (result.success) {
        onCreated(result.data as AdminService);
      } else {
        setError(result.error ?? 'Failed to create service');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <h3 className={styles.modalTitle}>New Service</h3>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Service Code *</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={serviceCode}
              onChange={e => setServiceCode(e.target.value.toUpperCase())}
              placeholder="SEABAN"
              maxLength={10}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Short Code</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={shortCode}
              onChange={e => setShortCode(e.target.value.toUpperCase())}
              placeholder="CBX"
              maxLength={5}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Service Name *</label>
            <input
              className={styles.formInput}
              value={serviceName}
              onChange={e => setServiceName(e.target.value)}
              placeholder="South America Banana Express"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Frequency</label>
            <select
              className={styles.formSelect}
              value={frequency}
              onChange={e => setFrequency(e.target.value as any)}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cycle Duration (weeks)</label>
            <input
              type="number"
              className={styles.formInput}
              value={cycleDurationWeeks}
              onChange={e => setCycleDurationWeeks(Number(e.target.value))}
              min={1}
              max={52}
            />
          </div>
        </div>

        <div>
          <p className={styles.sectionHeader}>Port Rotation</p>
          <PortRotationEditor ports={ports} onChange={setPorts} />
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !serviceCode.trim() || !serviceName.trim() || ports.length < 2}
          >
            {isPending ? 'Creating…' : 'Create Service'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Service Modal
// ---------------------------------------------------------------------------

function EditServiceModal({ service, onClose, onUpdated }: {
  service: AdminService;
  onClose: () => void;
  onUpdated: (s: AdminService) => void;
}) {
  const [shortCode, setShortCode] = useState(service.shortCode ?? '');
  const [serviceName, setServiceName] = useState(service.serviceName);
  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>(
    (service.frequency as any) ?? 'WEEKLY'
  );
  const [cycleDurationWeeks, setCycleDurationWeeks] = useState(service.cycleDurationWeeks ?? 4);
  const [ports, setPorts] = useState<PortEntry[]>(
    service.portRotation
      .slice()
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map(p => ({
        portCode: p.portCode,
        portName: p.portName,
        country: p.country,
        operations: p.operations as ('LOAD' | 'DISCHARGE')[],
        weeksFromStart: p.weeksFromStart,
      }))
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!serviceName.trim()) { setError('Service name is required'); return; }
    if (ports.length < 2) { setError('At least 2 ports are required'); return; }
    setError(null);
    startTransition(async () => {
      const portRotation = ports.map((p, i) => ({
        portCode: p.portCode,
        portName: p.portName,
        country: p.country,
        sequence: i + 1,
        weeksFromStart: p.weeksFromStart,
        operations: p.operations,
      }));
      const result = await updateService(service._id, {
        shortCode: shortCode.toUpperCase().trim() || undefined,
        serviceName: serviceName.trim(),
        frequency,
        cycleDurationWeeks,
        portRotation,
      });
      if (result.success) {
        onUpdated(result.data as AdminService);
      } else {
        setError(result.error ?? 'Failed to save service');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <h3 className={styles.modalTitle}>Edit Service — {service.serviceCode}</h3>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Short Code</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={shortCode}
              onChange={e => setShortCode(e.target.value.toUpperCase())}
              placeholder="CBX"
              maxLength={5}
            />
          </div>
          <div className={styles.formGroupFull} style={{ gridColumn: undefined }}>
            <label className={styles.formLabel}>Service Name *</label>
            <input
              className={styles.formInput}
              value={serviceName}
              onChange={e => setServiceName(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Frequency</label>
            <select
              className={styles.formSelect}
              value={frequency}
              onChange={e => setFrequency(e.target.value as any)}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cycle Duration (weeks)</label>
            <input
              type="number"
              className={styles.formInput}
              value={cycleDurationWeeks}
              onChange={e => setCycleDurationWeeks(Number(e.target.value))}
              min={1}
              max={52}
            />
          </div>
        </div>

        <div>
          <p className={styles.sectionHeader}>Port Rotation</p>
          <PortRotationEditor ports={ports} onChange={setPorts} />
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={isPending || !serviceName.trim() || ports.length < 2}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services Tab
// ---------------------------------------------------------------------------

function ServicesTab({ initialServices }: { initialServices: AdminService[] }) {
  const router = useRouter();
  const [services, setServices] = useState<AdminService[]>(initialServices);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingService, setEditingService] = useState<AdminService | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirmService = services.find(s => s._id === confirmId);

  const handleDeactivate = () => {
    if (!confirmId) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteService(confirmId);
      if (result.success) {
        setServices(prev => prev.map(s => s._id === confirmId ? { ...s, active: false } : s));
        setConfirmId(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Deactivation failed');
      }
    });
  };

  const handleActivate = (id: string) => {
    startTransition(async () => {
      const result = await updateService(id, { active: true });
      if (result.success) {
        setServices(prev => prev.map(s => s._id === id ? { ...s, active: true } : s));
        router.refresh();
      }
    });
  };

  const portSummary = (svc: AdminService) =>
    svc.portRotation
      .slice()
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map(p => p.portCode)
      .join(' → ');

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{services.length} services</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          + New Service
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Port Rotation</th>
              <th>Frequency</th>
              <th>Status</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyCell}>No services found.</td></tr>
            ) : (
              services.map(s => {
                const isActive = s.active !== false;
                return (
                  <tr key={s._id} className={!isActive ? styles.rowCancelled : ''}>
                    <td>
                      <span className={styles.modalVoyageNumber}>{s.serviceCode}</span>
                      {s.shortCode && (
                        <span className={styles.wkBadge}>{s.shortCode}</span>
                      )}
                    </td>
                    <td>{s.serviceName}</td>
                    <td className={styles.cellSecondary} style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                      {portSummary(s) || '—'}
                    </td>
                    <td className={styles.cellSecondary}>{s.frequency ?? '—'}</td>
                    <td>
                      <span
                        className={styles.badge}
                        style={isActive
                          ? { background: 'var(--color-success-muted)', color: 'var(--color-success)' }
                          : { background: 'var(--color-danger-muted)', color: 'var(--color-danger)' }}
                      >
                        {isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className={styles.cellActions}>
                      <button
                        className={styles.btnSm}
                        onClick={() => setEditingService(s)}
                      >
                        Edit
                      </button>
                      {isActive ? (
                        <button
                          className={styles.btnWarn}
                          onClick={() => { setConfirmId(s._id); setErrorMsg(null); }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className={styles.btnSuccess}
                          onClick={() => handleActivate(s._id)}
                          disabled={isPending}
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmService && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Deactivate Service</h3>
            <div className={styles.modalVoyageInfo}>
              <span className={styles.modalVoyageNumber}>{confirmService.serviceCode}</span>
            </div>
            <p className={styles.modalBody}>
              Deactivating <strong>{confirmService.serviceName}</strong> hides it from voyage creation
              and booking workflows. Existing voyages and bookings are not affected.
              The service can be reactivated at any time.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmId(null)} disabled={isPending}>
                Cancel
              </button>
              <button className={styles.btnModalWarn} onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating…' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateServiceModal
          onClose={() => setShowCreate(false)}
          onCreated={svc => {
            setServices(prev => [svc, ...prev]);
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}

      {editingService && (
        <EditServiceModal
          service={editingService}
          onClose={() => setEditingService(null)}
          onUpdated={svc => {
            setServices(prev => prev.map(s => s._id === svc._id ? svc : s));
            setEditingService(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stub tab (users only)
// ---------------------------------------------------------------------------

function StubTab({ label }: { label: string }) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.stubMsg}>
        <span className={styles.stubIcon}>🚧</span>
        <p><strong>{label}</strong> management coming in a follow-up task.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: 'voyages',   label: 'Voyages'       },
  { id: 'contracts', label: 'Contracts'     },
  { id: 'plans',     label: 'Stowage Plans' },
  { id: 'vessels',   label: 'Vessels'       },
  { id: 'services',  label: 'Services'      },
  { id: 'users',     label: 'Users'         },
];

interface AdminClientProps {
  voyages: AdminVoyage[];
  contracts: DisplayContract[];
  offices: any[];
  services: any[];
  plans: AdminPlan[];
  vessels: AdminVessel[];
}

export default function AdminClient({ voyages, contracts, offices, services, plans, vessels }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('voyages');

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Administration</h1>
          <p className={styles.pageSubtitle}>
            Entity management · destructive operations · admin-only (auth coming soon)
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((t: any) => (
          <button
            key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles['tabBtn--active'] : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'voyages'   && <VoyagesTab initialVoyages={voyages} />}
      {activeTab === 'contracts' && (
        <div className={styles.tabContent}>
          <ContractsClient contracts={contracts} offices={offices} services={services} />
        </div>
      )}
      {activeTab === 'plans'    && <PlansTab initialPlans={plans} />}
      {activeTab === 'vessels'  && <VesselsTab initialVessels={vessels} />}
      {activeTab === 'services' && <ServicesTab initialServices={services as AdminService[]} />}
      {activeTab === 'users'    && <StubTab label="Users" />}
    </div>
  );
}
