'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cancelVoyage, hardDeleteVoyage } from '@/app/actions/voyage';
import { deleteStowagePlan } from '@/app/actions/stowage-plan';
import { createVessel, updateVessel } from '@/app/actions/vessel';
import { deleteService, createService, updateService } from '@/app/actions/service';
import { createUser, updateUser, deleteUser, resendUserConfirmation } from '@/app/actions/user';
import { getPorts, createPort, updatePort } from '@/app/actions/port';
import { getShipperCodes } from '@/app/actions/contract';
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

interface ZoneSection {
  sectionId: string;
  sqm: number;
  designStowageFactor: number;
}

interface VesselZone {
  zoneId: string;
  coolingSections: ZoneSection[];
}

interface AdminVessel {
  _id: string;
  name: string;
  imoNumber?: string;
  flag?: string;
  callSign?: string;
  built?: number;
  capacity?: { totalPallets?: number; totalSqm?: number };
  temperatureZones?: VesselZone[];
  active?: boolean;
  voyageCount: number;
}

// Form-level zone types (string values for number inputs during editing)
interface FormSection { sectionId: string; sqm: string; factor: string; }
interface FormZone { zoneId: string; sections: FormSection[]; }

function toFormZones(zones?: VesselZone[]): FormZone[] {
  return (zones ?? []).map(z => ({
    zoneId: z.zoneId,
    sections: z.coolingSections.map(s => ({
      sectionId: s.sectionId,
      sqm: String(s.sqm),
      factor: String(s.designStowageFactor),
    })),
  }));
}

function fromFormZones(formZones: FormZone[]) {
  return formZones.map(z => ({
    zoneId: z.zoneId,
    coolingSections: z.sections.map(s => ({
      sectionId: s.sectionId,
      sqm: parseFloat(s.sqm) || 0,
      designStowageFactor: parseFloat(s.factor) || 1.32,
    })),
  }));
}

interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  company: string;
  port: string;
  canSendEmailsToCaptains: boolean;
  shipperCode: string;
  emailConfirmed: boolean;
  lastLogin: string | null;
  createdAt: string | null;
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
  city?: string;
  operations: ('LOAD' | 'DISCHARGE')[];
  weeksFromStart: number;
}

interface AdminPort {
  _id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  active: boolean;
}

type Tab = 'voyages' | 'contracts' | 'plans' | 'vessels' | 'services' | 'users' | 'ports';

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

// ---------------------------------------------------------------------------
// Temperature Zone Editor
// ---------------------------------------------------------------------------

function TemperatureZoneEditor({ zones, onChange }: {
  zones: FormZone[];
  onChange: (z: FormZone[]) => void;
}) {
  const [newZoneId, setNewZoneId] = useState('');
  const [zoneErr, setZoneErr] = useState('');
  const [addingSection, setAddingSection] = useState<Record<string, FormSection>>({});

  const getAdding = (zid: string): FormSection =>
    addingSection[zid] ?? { sectionId: '', sqm: '', factor: '1.32' };

  const setAdding = (zid: string, val: FormSection) =>
    setAddingSection(prev => ({ ...prev, [zid]: val }));

  const addZone = () => {
    const zid = newZoneId.trim().toUpperCase();
    if (!zid) return;
    if (zones.some(z => z.zoneId === zid)) { setZoneErr('Zone already exists'); return; }
    onChange([...zones, { zoneId: zid, sections: [] }]);
    setNewZoneId('');
    setZoneErr('');
  };

  const removeZone = (zoneId: string) => onChange(zones.filter(z => z.zoneId !== zoneId));

  const addSection = (zoneId: string) => {
    const a = getAdding(zoneId);
    const sid = a.sectionId.trim().toUpperCase();
    if (!sid || !a.sqm) return;
    const zone = zones.find(z => z.zoneId === zoneId)!;
    if (zone.sections.some(s => s.sectionId === sid)) return;
    onChange(zones.map(z => z.zoneId === zoneId
      ? { ...z, sections: [...z.sections, { sectionId: sid, sqm: a.sqm, factor: a.factor || '1.32' }] }
      : z
    ));
    setAdding(zoneId, { sectionId: '', sqm: '', factor: '1.32' });
  };

  const removeSection = (zoneId: string, sectionId: string) =>
    onChange(zones.map(z => z.zoneId === zoneId
      ? { ...z, sections: z.sections.filter(s => s.sectionId !== sectionId) }
      : z
    ));

  return (
    <div className={styles.zoneEditor}>
      {zones.length === 0 && (
        <p className={styles.portEmptyHint}>No temperature zones yet. Add zones below.</p>
      )}

      {zones.map(zone => {
        const a = getAdding(zone.zoneId);
        const totalSqm = zone.sections.reduce((s, x) => s + (parseFloat(x.sqm) || 0), 0);
        const totalPallets = zone.sections.reduce((s, x) =>
          s + Math.floor((parseFloat(x.sqm) || 0) * (parseFloat(x.factor) || 1.32)), 0);
        return (
          <div key={zone.zoneId} className={styles.zoneBlock}>
            <div className={styles.zoneHeader}>
              <span className={styles.zoneIdTag}>{zone.zoneId}</span>
              <span className={styles.zoneCount}>
                {zone.sections.length} section{zone.sections.length !== 1 ? 's' : ''}
                {totalSqm > 0 && ` · ${totalSqm.toFixed(1)} m² · ~${totalPallets} pallets`}
              </span>
              <button type="button" className={styles.btnRemovePort}
                onClick={() => removeZone(zone.zoneId)} title="Remove zone">×</button>
            </div>

            {zone.sections.length > 0 && (
              <div className={styles.zoneTableWrap}>
                <table className={styles.zoneTable}>
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>m²</th>
                      <th>Design factor</th>
                      <th>Max pallets *</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.sections.map(s => (
                      <tr key={s.sectionId}>
                        <td><span className={styles.zoneIdTag}>{s.sectionId}</span></td>
                        <td>{s.sqm}</td>
                        <td>{s.factor}</td>
                        <td className={styles.calcPallets}>
                          ~{Math.floor((parseFloat(s.sqm) || 0) * (parseFloat(s.factor) || 1.32))}
                        </td>
                        <td>
                          <button type="button" className={styles.btnRemovePort}
                            onClick={() => removeSection(zone.zoneId, s.sectionId)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add section inline row */}
            <div className={styles.sectionAddRow}>
              <input
                className={`${styles.sectionAddInput} ${styles.sectionAddInputId}`}
                value={a.sectionId}
                onChange={e => setAdding(zone.zoneId, { ...a, sectionId: e.target.value.toUpperCase() })}
                placeholder="1A"
                maxLength={10}
                onKeyDown={e => e.key === 'Enter' && addSection(zone.zoneId)}
              />
              <input
                type="number"
                className={`${styles.sectionAddInput} ${styles.sectionAddInputNum}`}
                value={a.sqm}
                onChange={e => setAdding(zone.zoneId, { ...a, sqm: e.target.value })}
                placeholder="m²"
                min={0}
                step={0.1}
              />
              <input
                type="number"
                className={`${styles.sectionAddInput} ${styles.sectionAddInputNum}`}
                value={a.factor}
                onChange={e => setAdding(zone.zoneId, { ...a, factor: e.target.value })}
                placeholder="1.32"
                min={0.1}
                max={10}
                step={0.01}
              />
              <button type="button" className={styles.btnSm}
                onClick={() => addSection(zone.zoneId)}
                disabled={!a.sectionId.trim() || !a.sqm}>
                + Section
              </button>
              <span className={styles.calcPallets}>ID · m² · factor</span>
            </div>
          </div>
        );
      })}

      {/* Add zone row */}
      <div className={styles.portAddForm}>
        <div className={styles.zoneAddRow}>
          <input
            className={`${styles.portAddInput} ${styles.portAddInputCode}`}
            value={newZoneId}
            onChange={e => { setNewZoneId(e.target.value.toUpperCase()); setZoneErr(''); }}
            placeholder="1AB"
            maxLength={20}
            onKeyDown={e => e.key === 'Enter' && addZone()}
          />
          <button type="button" className={styles.btnSm} onClick={addZone}
            disabled={!newZoneId.trim()}>
            + Add Zone
          </button>
          <span className={styles.calcPallets}>Zone ID (e.g. 1AB, 2UPDCD)</span>
        </div>
        {zoneErr && <span className={styles.portAddError}>{zoneErr}</span>}
        <span className={styles.calcPallets}>* Max pallets = floor(m² × design factor)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Vessel Modal
// ---------------------------------------------------------------------------

function CreateVesselModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (v: AdminVessel) => void;
}) {
  const [name, setName] = useState('');
  const [imoNumber, setImoNumber] = useState('');
  const [flag, setFlag] = useState('');
  const [callSign, setCallSign] = useState('');
  const [builtYear, setBuiltYear] = useState('');
  const [totalPallets, setTotalPallets] = useState('');
  const [totalSqm, setTotalSqm] = useState('');
  const [zones, setZones] = useState<FormZone[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim() || !imoNumber.trim() || !flag.trim()) {
      setError('Vessel name, IMO number and flag are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createVessel({
        name: name.trim(),
        imoNumber: imoNumber.trim(),
        flag: flag.trim().toUpperCase(),
        callSign: callSign.trim() || undefined,
        built: builtYear ? Number(builtYear) : undefined,
        capacity: (totalPallets || totalSqm) ? {
          totalPallets: totalPallets ? Number(totalPallets) : undefined,
          totalSqm: totalSqm ? Number(totalSqm) : undefined,
        } : undefined,
        temperatureZones: fromFormZones(zones),
      });
      if (result.success) {
        onCreated(result.data as AdminVessel);
      } else {
        setError(result.error ?? 'Failed to create vessel');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalXWide}`}>
        <h3 className={styles.modalTitle}>New Vessel</h3>

        {/* Basic info */}
        <p className={styles.sectionHeader}>Basic Information</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Vessel Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value.toUpperCase())}
              placeholder="ACONCAGUA BAY"
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>IMO Number * (7 digits)</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={imoNumber}
              onChange={e => setImoNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
              placeholder="9999999"
              maxLength={7}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Flag * (2-letter ISO)</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={flag}
              onChange={e => setFlag(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
              placeholder="PA"
              maxLength={2}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Call Sign</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={callSign}
              onChange={e => setCallSign(e.target.value.toUpperCase())}
              placeholder="HPXY1"
              maxLength={10}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Year Built</label>
            <input
              type="number"
              className={styles.formInput}
              value={builtYear}
              onChange={e => setBuiltYear(e.target.value)}
              placeholder="2010"
              min={1900}
              max={2100}
            />
          </div>
        </div>

        {/* Capacity */}
        <p className={styles.sectionHeader}>Cargo Capacity</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Total Pallets</label>
            <input
              type="number"
              className={styles.formInput}
              value={totalPallets}
              onChange={e => setTotalPallets(e.target.value)}
              placeholder="1400"
              min={1}
              max={99999}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Total Floor Area (m²)</label>
            <input
              type="number"
              className={styles.formInput}
              value={totalSqm}
              onChange={e => setTotalSqm(e.target.value)}
              placeholder="1060"
              min={1}
              step={0.1}
            />
          </div>
        </div>

        {/* Temperature Zones */}
        <p className={styles.sectionHeader}>Temperature Zones & Cooling Sections</p>
        <TemperatureZoneEditor zones={zones} onChange={setZones} />

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || imoNumber.length !== 7 || flag.length !== 2}
          >
            {isPending ? 'Creating…' : 'Create Vessel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Vessel Modal
// ---------------------------------------------------------------------------

function EditVesselModal({ vessel, onClose, onUpdated }: {
  vessel: AdminVessel;
  onClose: () => void;
  onUpdated: (v: AdminVessel) => void;
}) {
  const [name, setName] = useState(vessel.name);
  const [imoNumber, setImoNumber] = useState(vessel.imoNumber ?? '');
  const [flag, setFlag] = useState(vessel.flag ?? '');
  const [callSign, setCallSign] = useState(vessel.callSign ?? '');
  const [builtYear, setBuiltYear] = useState(vessel.built ? String(vessel.built) : '');
  const [totalPallets, setTotalPallets] = useState(String(vessel.capacity?.totalPallets ?? ''));
  const [totalSqm, setTotalSqm] = useState(String(vessel.capacity?.totalSqm ?? ''));
  const [zones, setZones] = useState<FormZone[]>(() => toFormZones(vessel.temperatureZones));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim() || !flag.trim()) {
      setError('Vessel name and flag are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateVessel(vessel._id, {
        name: name.trim(),
        imoNumber: imoNumber.trim() || undefined,
        flag: flag.trim().toUpperCase(),
        callSign: callSign.trim() || undefined,
        built: builtYear ? Number(builtYear) : undefined,
        capacity: (totalPallets || totalSqm) ? {
          totalPallets: totalPallets ? Number(totalPallets) : undefined,
          totalSqm: totalSqm ? Number(totalSqm) : undefined,
        } : undefined,
        temperatureZones: fromFormZones(zones),
      });
      if (result.success) {
        onUpdated({ ...vessel, ...result.data } as AdminVessel);
      } else {
        setError(result.error ?? 'Failed to save vessel');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalXWide}`}>
        <h3 className={styles.modalTitle}>Edit Vessel — {vessel.name}</h3>

        {/* Basic info */}
        <p className={styles.sectionHeader}>Basic Information</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Vessel Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value.toUpperCase())}
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>IMO Number (7 digits)</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={imoNumber}
              onChange={e => setImoNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
              maxLength={7}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Flag * (2-letter ISO)</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={flag}
              onChange={e => setFlag(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
              maxLength={2}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Call Sign</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={callSign}
              onChange={e => setCallSign(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Year Built</label>
            <input
              type="number"
              className={styles.formInput}
              value={builtYear}
              onChange={e => setBuiltYear(e.target.value)}
              placeholder="2010"
              min={1900}
              max={2100}
            />
          </div>
        </div>

        {/* Capacity */}
        <p className={styles.sectionHeader}>Cargo Capacity</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Total Pallets</label>
            <input
              type="number"
              className={styles.formInput}
              value={totalPallets}
              onChange={e => setTotalPallets(e.target.value)}
              placeholder="1400"
              min={1}
              max={99999}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Total Floor Area (m²)</label>
            <input
              type="number"
              className={styles.formInput}
              value={totalSqm}
              onChange={e => setTotalSqm(e.target.value)}
              placeholder="1060"
              min={1}
              step={0.1}
            />
          </div>
        </div>

        {/* Temperature Zones */}
        <p className={styles.sectionHeader}>Temperature Zones & Cooling Sections</p>
        <TemperatureZoneEditor zones={zones} onChange={setZones} />

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={isPending || !name.trim() || flag.length !== 2}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vessels Tab
// ---------------------------------------------------------------------------

function VesselsTab({ initialVessels }: { initialVessels: AdminVessel[] }) {
  const [vessels, setVessels] = useState<AdminVessel[]>(initialVessels);
  const [showCreate, setShowCreate] = useState(false);
  const [editingVessel, setEditingVessel] = useState<AdminVessel | null>(null);

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{vessels.length} vessels</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          + New Vessel
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Vessel Name</th>
              <th>IMO</th>
              <th>Flag / Call</th>
              <th>Built</th>
              <th className={styles.thNum}>Pallets</th>
              <th className={styles.thNum}>m²</th>
              <th className={styles.thNum}>Zones</th>
              <th className={styles.thNum}>Voyages</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vessels.length === 0 ? (
              <tr><td colSpan={9} className={styles.emptyCell}>No vessels found.</td></tr>
            ) : (
              vessels.map(v => {
                const zoneCount = v.temperatureZones?.length ?? 0;
                const sectionCount = v.temperatureZones?.reduce((s, z) => s + z.coolingSections.length, 0) ?? 0;
                return (
                  <tr key={v._id}>
                    <td>
                      <Link href={`/vessels/${v._id}`} className={styles.voyageLink}>
                        {v.name}
                      </Link>
                    </td>
                    <td className={styles.cellMono}>{v.imoNumber ?? '—'}</td>
                    <td className={styles.cellSecondary}>
                      {v.flag ?? '—'}
                      {v.callSign && (
                        <span className={styles.wkBadge}>{v.callSign}</span>
                      )}
                    </td>
                    <td className={styles.cellSecondary}>{v.built ?? '—'}</td>
                    <td className={`${styles.cellNum} ${v.capacity?.totalPallets ? styles.countNonZero : styles.countZero}`}>
                      {v.capacity?.totalPallets?.toLocaleString() ?? '—'}
                    </td>
                    <td className={`${styles.cellNum} ${v.capacity?.totalSqm ? styles.countNonZero : styles.countZero}`}>
                      {v.capacity?.totalSqm != null ? v.capacity.totalSqm.toLocaleString() : '—'}
                    </td>
                    <td className={`${styles.cellNum} ${zoneCount > 0 ? styles.countNonZero : styles.countZero}`}
                      title={sectionCount > 0 ? `${sectionCount} sections across ${zoneCount} zones` : undefined}>
                      {zoneCount > 0 ? `${zoneCount} / ${sectionCount}` : '—'}
                    </td>
                    <td className={`${styles.cellNum} ${v.voyageCount > 0 ? styles.countNonZero : styles.countZero}`}>
                      {v.voyageCount}
                    </td>
                    <td className={styles.cellActions}>
                      <button className={styles.btnSm} onClick={() => setEditingVessel(v)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateVesselModal
          onClose={() => setShowCreate(false)}
          onCreated={v => {
            setVessels(prev => [v, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
            setShowCreate(false);
          }}
        />
      )}

      {editingVessel && (
        <EditVesselModal
          vessel={editingVessel}
          onClose={() => setEditingVessel(null)}
          onUpdated={updated => {
            setVessels(prev => prev.map(v => v._id === updated._id ? { ...v, ...updated } : v));
            setEditingVessel(null);
          }}
        />
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
  const [masterPorts, setMasterPorts] = useState<AdminPort[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [newOps, setNewOps] = useState<('LOAD' | 'DISCHARGE')[]>(['LOAD']);
  const [addErr, setAddErr] = useState('');

  // Load master port list from DB on mount
  useEffect(() => {
    getPorts().then(res => {
      if (res.success) setMasterPorts((res.data as AdminPort[]).filter(p => p.active));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOp = (op: 'LOAD' | 'DISCHARGE') =>
    setNewOps(prev => prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]);

  const addPort = () => {
    if (!selectedCode) { setAddErr('Select a port from the list'); return; }
    if (newOps.length === 0) { setAddErr('Select at least one operation'); return; }
    if (ports.some(p => p.portCode === selectedCode)) { setAddErr('Port already in list'); return; }
    const mp = masterPorts.find(p => p.code === selectedCode);
    if (!mp) { setAddErr('Port not found'); return; }
    onChange([...ports, {
      portCode: mp.code,
      portName: mp.name,
      country: mp.country,
      city: mp.city,
      operations: newOps,
      weeksFromStart: ports.length,
    }]);
    setSelectedCode('');
    setNewOps(['LOAD']);
    setAddErr('');
  };

  const availablePorts = masterPorts.filter(mp => !ports.some(p => p.portCode === mp.code));

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
        {masterPorts.length === 0 ? (
          <p className={styles.portEmptyHint}>
            No ports available. Create ports in the Ports tab first.
          </p>
        ) : (
          <div className={styles.portAddRow}>
            <select
              className={styles.formSelect}
              value={selectedCode}
              onChange={e => { setSelectedCode(e.target.value); setAddErr(''); }}
              style={{ flex: 1 }}
            >
              <option value="">— Select port —</option>
              {availablePorts.map(mp => (
                <option key={mp.code} value={mp.code}>
                  {mp.code} — {mp.name} ({mp.country})
                </option>
              ))}
            </select>
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
              disabled={!selectedCode}
            >
              + Add
            </button>
          </div>
        )}
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
        city: p.city,
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
              required
              maxLength={80}
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
        city: p.city,
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
              required
              maxLength={80}
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
// Create User Modal
// ---------------------------------------------------------------------------

const USER_ROLES = [
  { value: 'ADMIN',            label: 'Admin' },
  { value: 'SHIPPING_PLANNER', label: 'Shipping Planner' },
  { value: 'STEVEDORE',        label: 'Stevedore' },
  { value: 'CHECKER',          label: 'Checker' },
  { value: 'EXPORTER',         label: 'Exporter' },
  { value: 'VIEWER',           label: 'Viewer' },
];

function CreateUserModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (u: AdminUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('SHIPPING_PLANNER');
  const [company, setCompany] = useState('');
  const [port, setPort] = useState('');
  const [canSend, setCanSend] = useState(false);
  const [shipperCode, setShipperCode] = useState('');
  const [shipperCodes, setShipperCodes] = useState<{ code: string; name: string }[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'EXPORTER') {
      getShipperCodes().then(r => { if (r.success) setShipperCodes(r.data); });
    }
  }, [role]);

  const handleSubmit = () => {
    if (!email.trim() || !name.trim()) {
      setError('Email and name are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createUser({
        email: email.trim(),
        name: name.trim(),
        role,
        company: company.trim() || undefined,
        port: port.trim() || undefined,
        canSendEmailsToCaptains: canSend,
        shipperCode: role === 'EXPORTER' ? shipperCode.trim() || undefined : undefined,
      });
      if (result.success) {
        onCreated(result.data as AdminUser);
      } else {
        setError(result.error ?? 'Failed to create user');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New User</h3>
        <p className={styles.modalBody}>
          An invitation email with a confirmation link will be sent to the user.
        </p>

        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Email *</label>
            <input
              className={styles.formInput}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@company.com"
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Full Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              maxLength={100}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Role *</label>
            <select
              className={styles.formSelect}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Company</label>
            <input
              className={styles.formInput}
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Exports Ltd."
              maxLength={100}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Base Port</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={port}
              onChange={e => setPort(e.target.value.toUpperCase())}
              placeholder="CRLIM"
              maxLength={10}
            />
          </div>
          <div className={styles.formGroup} style={{ justifyContent: 'flex-end' }}>
            <label className={styles.formLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={canSend}
                onChange={e => setCanSend(e.target.checked)}
              />
              Can send emails to captains
            </label>
          </div>
          {role === 'EXPORTER' && (
            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>Shipper / Exporter Code *</label>
              <select
                className={styles.formSelect}
                value={shipperCode}
                onChange={e => setShipperCode(e.target.value)}
              >
                <option value="">— Select shipper code —</option>
                {shipperCodes.map(s => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                Links this user to a shipper in active contracts. Create ports first if none appear.
              </span>
            </div>
          )}
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !email.trim() || !name.trim()}
          >
            {isPending ? 'Creating…' : 'Create & Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit User Modal
// ---------------------------------------------------------------------------

function EditUserModal({ user, onClose, onUpdated }: {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (u: AdminUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [company, setCompany] = useState(user.company);
  const [port, setPort] = useState(user.port);
  const [canSend, setCanSend] = useState(user.canSendEmailsToCaptains);
  const [shipperCode, setShipperCode] = useState((user as any).shipperCode ?? '');
  const [shipperCodes, setShipperCodes] = useState<{ code: string; name: string }[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'EXPORTER') {
      getShipperCodes().then(r => { if (r.success) setShipperCodes(r.data); });
    }
  }, [role]);

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    startTransition(async () => {
      const result = await updateUser(user._id, {
        name: name.trim(),
        role,
        company: company.trim(),
        port: port.trim(),
        canSendEmailsToCaptains: canSend,
        shipperCode: role === 'EXPORTER' ? shipperCode.trim() : '',
      });
      if (result.success) {
        onUpdated({ ...user, ...result.data } as AdminUser);
      } else {
        setError(result.error ?? 'Failed to save user');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit User</h3>
        <p className={styles.modalBody} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {user.email}
        </p>

        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Full Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Role *</label>
            <select
              className={styles.formSelect}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Company</label>
            <input
              className={styles.formInput}
              value={company}
              onChange={e => setCompany(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Base Port</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={port}
              onChange={e => setPort(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </div>
          <div className={styles.formGroup} style={{ justifyContent: 'flex-end' }}>
            <label className={styles.formLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={canSend}
                onChange={e => setCanSend(e.target.checked)}
              />
              Can send emails to captains
            </label>
          </div>
          {role === 'EXPORTER' && (
            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>Shipper / Exporter Code</label>
              <select
                className={styles.formSelect}
                value={shipperCode}
                onChange={e => setShipperCode(e.target.value)}
              >
                <option value="">— Select shipper code —</option>
                {shipperCodes.map(s => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={isPending || !name.trim()}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab({ initialUsers }: { initialUsers: AdminUser[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const confirmUser = users.find(u => u._id === confirmId);

  const handleDelete = () => {
    if (!confirmId) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteUser(confirmId);
      if (result.success) {
        setUsers(prev => prev.filter(u => u._id !== confirmId));
        setConfirmId(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Delete failed');
      }
    });
  };

  const handleResend = (id: string) => {
    setResendingId(id);
    startTransition(async () => {
      await resendUserConfirmation(id);
      setResendingId(null);
    });
  };

  const roleLabel = (role: string) =>
    USER_ROLES.find(r => r.value === role)?.label ?? role;

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{users.length} users</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          + New User
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Company</th>
              <th>Status</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyCell}>No users found.</td></tr>
            ) : (
              users.map(u => (
                <tr key={u._id}>
                  <td>
                    <span style={{ fontWeight: 'var(--weight-medium)' }}>{u.name}</span>
                  </td>
                  <td className={styles.cellMono}>{u.email}</td>
                  <td>
                    <span className={styles.badge} style={{
                      background: u.role === 'ADMIN' ? 'var(--color-warning-muted)' : 'var(--color-bg-tertiary)',
                      color: u.role === 'ADMIN' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                    }}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className={styles.cellSecondary}>{u.company || '—'}</td>
                  <td>
                    {u.emailConfirmed ? (
                      <span className={styles.badge} style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}>
                        Active
                      </span>
                    ) : (
                      <span className={styles.badge} style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)' }}>
                        Pending
                      </span>
                    )}
                  </td>
                  <td className={styles.cellActions}>
                    {!u.emailConfirmed && (
                      <button
                        className={styles.btnSm}
                        onClick={() => handleResend(u._id)}
                        disabled={resendingId === u._id || isPending}
                        title="Resend invitation email"
                      >
                        {resendingId === u._id ? 'Sending…' : 'Resend'}
                      </button>
                    )}
                    <button className={styles.btnSm} onClick={() => setEditingUser(u)}>
                      Edit
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={() => { setConfirmId(u._id); setErrorMsg(null); }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmUser && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>⚠ Delete User</h3>
            <div className={styles.modalVoyageInfo}>
              <span className={styles.modalVoyageNumber}>{confirmUser.name}</span>
              <span className={styles.cellMono} style={{ fontSize: '0.8em', opacity: 0.7 }}>
                {confirmUser.email}
              </span>
            </div>
            <p className={styles.modalBody}>
              This will <strong>permanently remove</strong> the user account.
              This action cannot be undone.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmId(null)} disabled={isPending}>
                Cancel
              </button>
              <button className={styles.btnModalDanger} onClick={handleDelete} disabled={isPending}>
                {isPending ? 'Deleting…' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={u => {
            setUsers(prev => [...prev, u].sort((a, b) => a.name.localeCompare(b.name)));
            setShowCreate(false);
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={updated => {
            setUsers(prev => prev.map(u => u._id === updated._id ? updated : u));
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ports Tab
// ---------------------------------------------------------------------------

function CreatePortModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: AdminPort) => void;
}) {
  const [code, setCode]       = useState('');
  const [name, setName]       = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity]       = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!code.trim() || !name.trim() || !country.trim() || !city.trim()) {
      setError('All fields are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createPort({ code: code.toUpperCase().trim(), name: name.trim(), country: country.toUpperCase().trim(), city: city.trim() });
      if (result.success) {
        onCreated(result.data as AdminPort);
      } else {
        setError(result.error ?? 'Failed to create port');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New Port</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>UNLOCODE *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CLVAP" maxLength={6} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country (2-letter) *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="CL" maxLength={2} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Port Name *</label>
            <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} placeholder="Valparaíso" maxLength={100} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>City (for weather data) *</label>
            <input className={styles.formInput} value={city} onChange={e => setCity(e.target.value)} placeholder="Valparaíso" maxLength={100} />
            <span className={styles.formHint}>City name used to fetch weather forecasts via OpenWeatherMap API.</span>
          </div>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={isPending || !code.trim() || !name.trim() || !country.trim() || !city.trim()}>
            {isPending ? 'Creating…' : 'Create Port'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPortModal({ port, onClose, onUpdated }: {
  port: AdminPort;
  onClose: () => void;
  onUpdated: (p: AdminPort) => void;
}) {
  const [name, setName]       = useState(port.name);
  const [country, setCountry] = useState(port.country);
  const [city, setCity]       = useState(port.city);
  const [active, setActive]   = useState(port.active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim() || !country.trim() || !city.trim()) {
      setError('All fields are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePort(port._id, { name: name.trim(), country: country.toUpperCase().trim(), city: city.trim(), active });
      if (result.success) {
        onUpdated(result.data as AdminPort);
      } else {
        setError(result.error ?? 'Failed to update port');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit Port — {port.code}</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Port Name *</label>
            <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} maxLength={100} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country (2-letter) *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>City (weather) *</label>
            <input className={styles.formInput} value={city} onChange={e => setCity(e.target.value)} maxLength={100} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ marginRight: 6 }} />
              Active (visible for service selection)
            </label>
          </div>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PortsTab({ initialPorts }: { initialPorts: AdminPort[] }) {
  const router = useRouter();
  const [ports, setPorts] = useState<AdminPort[]>(initialPorts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPort, setEditingPort] = useState<AdminPort | null>(null);

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{ports.length} ports</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          + New Port
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Port Name</th>
              <th>Country</th>
              <th>City (weather)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ports.map(p => (
              <tr key={p._id} style={{ opacity: p.active ? 1 : 0.5 }}>
                <td><code>{p.code}</code></td>
                <td>{p.name}</td>
                <td>{p.country}</td>
                <td>{p.city}</td>
                <td>
                  <span className={styles.badge} style={{
                    background: p.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                    color: p.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className={styles.btnSm} onClick={() => setEditingPort(p)}>Edit</button>
                </td>
              </tr>
            ))}
            {ports.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No ports yet. Create the first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreatePortModal
          onClose={() => setShowCreate(false)}
          onCreated={p => { setPorts(prev => [...prev, p]); setShowCreate(false); router.refresh(); }}
        />
      )}
      {editingPort && (
        <EditPortModal
          port={editingPort}
          onClose={() => setEditingPort(null)}
          onUpdated={p => { setPorts(prev => prev.map(x => x._id === p._id ? p : x)); setEditingPort(null); router.refresh(); }}
        />
      )}
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
  { id: 'ports',     label: 'Ports'         },
];

interface AdminClientProps {
  voyages: AdminVoyage[];
  contracts: DisplayContract[];
  offices: any[];
  services: any[];
  plans: AdminPlan[];
  vessels: AdminVessel[];
  users: AdminUser[];
  ports: AdminPort[];
}

export default function AdminClient({ voyages, contracts, offices, services, plans, vessels, users, ports }: AdminClientProps) {
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
      {activeTab === 'users'    && <UsersTab initialUsers={users} />}
      {activeTab === 'ports'    && <PortsTab initialPorts={ports} />}
    </div>
  );
}
