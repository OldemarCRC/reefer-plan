'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cancelVoyage, hardDeleteVoyage } from '@/app/actions/voyage';
import { deleteStowagePlan } from '@/app/actions/stowage-plan';
import { createVessel, updateVessel } from '@/app/actions/vessel';
import { deleteService, createService, updateService } from '@/app/actions/service';
import { createUser, updateUser, deleteUser, resendUserConfirmation } from '@/app/actions/user';
import { getPorts, createPort, updatePort, importAllPortsFromUnece } from '@/app/actions/port';
import { createShipper, updateShipper, deactivateShipper } from '@/app/actions/shipper';
import { createOffice, updateOffice, deleteOffice } from '@/app/actions/office';
import { approveBooking, rejectBooking, cancelBooking } from '@/app/actions/booking';
import { createCustomer, updateCustomer, deactivateCustomer } from '@/app/actions/customer';
import { getCountries } from '@/app/actions/country';
import CountrySelect from '@/components/ui/CountrySelect';
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
  captainEmail?: string;
  active?: boolean;
  voyageCount: number;
}

interface AdminShipper {
  _id: string;
  name: string;
  code: string;
  contact: string;
  email: string;
  phone?: string;
  country: string;
  active: boolean;
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
  shipperId?: string | null;
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
  unlocode: string;
  countryCode: string;
  country: string;
  portName: string;
  weatherCity: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
}

interface UnecePort {
  _id: string;
  unlocode: string;
  countryCode: string;
  country: string;
  portName: string;
  latitude?: number;
  longitude?: number;
}

interface AdminOffice {
  _id: string;
  code: string;
  name: string;
  country: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  active: boolean;
  createdAt?: string;
}

interface AdminBooking {
  _id: string;
  bookingNumber: string;
  voyageNumber: string;
  shipper: { name: string; code: string };
  consignee: { name: string; code: string };
  cargoType: string;
  requestedQuantity: number;
  confirmedQuantity: number;
  status: string;
  createdAt?: string;
}

interface AdminCustomer {
  _id: string;
  customerNumber: string;
  name: string;
  type: 'CONSIGNEE' | 'SHIPPER' | 'AGENT';
  countryCode: string;
  country: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  notes: string;
  active: boolean;
  createdBy: string;
  createdAt: string | null;
}

const BOOKING_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PENDING:   { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  PARTIAL:   { bg: 'var(--color-yellow-muted)',  color: 'var(--color-yellow)' },
  STANDBY:   { bg: 'var(--color-info-muted)',    color: 'var(--color-info)' },
  REJECTED:  { bg: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-bg-tertiary)',   color: 'var(--color-text-tertiary)' },
};

function BookingStatusBadge({ status }: { status: string }) {
  const s = BOOKING_STATUS_COLORS[status] ?? { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: s.bg, color: s.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmtCargo(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

type Tab = 'voyages' | 'contracts' | 'plans' | 'vessels' | 'services' | 'users' | 'ports' | 'shippers' | 'offices' | 'bookings' | 'customers';

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
// Detail Panel helpers (shared across all tab detail views)
// ---------------------------------------------------------------------------

function DetailPanel({ onBack, title, actions, children }: {
  onBack: () => void;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailPanelHeader}>
        <button className={styles.btnBack} onClick={onBack}>← Back</button>
        <span className={styles.detailPanelTitle}>{title}</span>
        {actions && <div className={styles.detailPanelHeaderActions}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function DRow({ label, value, full, mono }: {
  label: string;
  value?: React.ReactNode;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={`${styles.detailField} ${full ? styles.detailFieldFull : ''}`}>
      <span className={styles.detailLabel}>{label}</span>
      <div className={`${styles.detailValue} ${mono ? styles.cellMono : ''}`}>{value ?? '—'}</div>
    </div>
  );
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
  const [selectedVoyage, setSelectedVoyage] = useState<AdminVoyage | null>(null);

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

  if (selectedVoyage) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedVoyage.voyageNumber}
          onBack={() => setSelectedVoyage(null)}
          actions={
            <Link href={`/voyages/${selectedVoyage._id}`} className={styles.btnSm} style={{ textDecoration: 'none' }}>
              Open Voyage →
            </Link>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Voyage #" value={<code>{selectedVoyage.voyageNumber}</code>} />
            <DRow label="Status" value={<StatusBadge status={selectedVoyage.status} />} />
            <DRow label="Vessel" value={selectedVoyage.vesselId?.name} />
            <DRow label="Service" value={selectedVoyage.serviceId?.serviceCode} />
            <DRow label="Departure" value={fmtDate(selectedVoyage.departureDate)} />
            <DRow label="Arrival" value={fmtDate(selectedVoyage.arrivalDate)} />
            <DRow label="Week" value={selectedVoyage.weekNumber != null ? `WK${String(selectedVoyage.weekNumber).padStart(2, '0')}` : undefined} />
            <DRow label="Stowage Plans" value={selectedVoyage.planCount} />
            <DRow label="Bookings" value={selectedVoyage.bookingCount} />
          </div>
        </DetailPanel>
      </div>
    );
  }

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
                  <tr key={v._id} className={`${isCancelled ? styles.rowCancelled : ''} ${styles.trClickable}`} onClick={() => setSelectedVoyage(v)}>
                    <td>
                      <Link href={`/voyages/${v._id}`} className={styles.voyageLink} onClick={e => e.stopPropagation()}>
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
                          onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'cancel', voyage: v }); }}
                          title="Soft cancel — keeps record for audit"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className={`${styles.btnDanger} ${!canHardDelete ? styles.btnBlocked : ''}`}
                        onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'hard-delete', voyage: v }); }}
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
  const [captainEmail, setCaptainEmail] = useState('');
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
        captainEmail: captainEmail.trim() || undefined,
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
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Captain Email <span style={{ fontWeight: 'normal', opacity: 0.6 }}>(optional)</span></label>
            <input
              className={styles.formInput}
              type="email"
              value={captainEmail}
              onChange={e => setCaptainEmail(e.target.value)}
              placeholder="captain@vessel.com"
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
  const [captainEmailEdit, setCaptainEmailEdit] = useState(vessel.captainEmail ?? '');
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
        captainEmail: captainEmailEdit.trim(), // '' means clear; server handles unset
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
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Captain Email <span style={{ fontWeight: 'normal', opacity: 0.6 }}>(optional)</span></label>
            <input
              className={styles.formInput}
              type="email"
              value={captainEmailEdit}
              onChange={e => setCaptainEmailEdit(e.target.value)}
              placeholder="captain@vessel.com"
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
  const [selectedVessel, setSelectedVessel] = useState<AdminVessel | null>(null);

  if (selectedVessel) {
    const zoneCount = selectedVessel.temperatureZones?.length ?? 0;
    const sectionCount = selectedVessel.temperatureZones?.reduce((s, z) => s + z.coolingSections.length, 0) ?? 0;
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedVessel.name}
          onBack={() => setSelectedVessel(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingVessel(selectedVessel)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Vessel Name" value={selectedVessel.name} />
            <DRow label="IMO Number" value={selectedVessel.imoNumber} mono />
            <DRow label="Flag" value={selectedVessel.flag} />
            <DRow label="Call Sign" value={selectedVessel.callSign} mono />
            <DRow label="Built" value={selectedVessel.built} />
            <DRow label="Voyages" value={selectedVessel.voyageCount} />
            <DRow label="Total Pallets" value={selectedVessel.capacity?.totalPallets?.toLocaleString()} />
            <DRow label="Total m²" value={selectedVessel.capacity?.totalSqm != null ? selectedVessel.capacity.totalSqm.toLocaleString() : undefined} />
            <DRow label="Temperature Zones" value={zoneCount > 0 ? `${zoneCount} zones / ${sectionCount} sections` : undefined} />
            <DRow label="Captain Email" value={selectedVessel.captainEmail} mono />
          </div>
        </DetailPanel>
        {editingVessel && (
          <EditVesselModal
            vessel={editingVessel}
            onClose={() => setEditingVessel(null)}
            onUpdated={v => { setVessels(prev => prev.map(x => x._id === v._id ? v : x)); setSelectedVessel(v); setEditingVessel(null); }}
          />
        )}
      </div>
    );
  }

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
                  <tr key={v._id} className={styles.trClickable} onClick={() => setSelectedVessel(v)}>
                    <td>
                      <Link href={`/vessels/${v._id}`} className={styles.voyageLink} onClick={e => e.stopPropagation()}>
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
                      <button className={styles.btnSm} onClick={(e) => { e.stopPropagation(); setEditingVessel(v); }}>
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
    const mp = masterPorts.find(p => p.unlocode === selectedCode);
    if (!mp) { setAddErr('Port not found'); return; }
    onChange([...ports, {
      portCode: mp.unlocode,
      portName: mp.portName,
      country: mp.countryCode,
      city: mp.weatherCity,
      operations: newOps,
      weeksFromStart: ports.length,
    }]);
    setSelectedCode('');
    setNewOps(['LOAD']);
    setAddErr('');
  };

  const availablePorts = masterPorts.filter(mp => !ports.some(p => p.portCode === mp.unlocode));

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
                <option key={mp.unlocode} value={mp.unlocode}>
                  {mp.unlocode} — {mp.portName} ({mp.countryCode})
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
  const [selectedService, setSelectedService] = useState<AdminService | null>(null);

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

  if (selectedService) {
    const sortedPorts = [...selectedService.portRotation].sort((a: any, b: any) => a.sequence - b.sequence);
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedService.serviceCode}
          onBack={() => setSelectedService(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingService(selectedService)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Service Code" value={<code>{selectedService.serviceCode}</code>} />
            <DRow label="Short Code" value={selectedService.shortCode} mono />
            <DRow label="Service Name" value={selectedService.serviceName} />
            <DRow label="Frequency" value={selectedService.frequency} />
            <DRow label="Cycle (weeks)" value={selectedService.cycleDurationWeeks} />
            <DRow label="Status" value={
              <span className={styles.badge} style={selectedService.active !== false
                ? { background: 'var(--color-success-muted)', color: 'var(--color-success)' }
                : { background: 'var(--color-danger-muted)', color: 'var(--color-danger)' }}>
                {selectedService.active !== false ? 'ACTIVE' : 'INACTIVE'}
              </span>
            } />
            {sortedPorts.length > 0 && (
              <>
                <div className={styles.detailSectionHeading}>Port Rotation ({sortedPorts.length} ports)</div>
                <table className={styles.detailTable}>
                  <thead>
                    <tr><th>#</th><th>Code</th><th>Port Name</th><th>Country</th><th>Operations</th><th>Wk offset</th></tr>
                  </thead>
                  <tbody>
                    {sortedPorts.map((p: any) => (
                      <tr key={p.portCode + p.sequence}>
                        <td>{p.sequence}</td>
                        <td><code>{p.portCode}</code></td>
                        <td>{p.portName}</td>
                        <td>{p.country}</td>
                        <td>{(p.operations || []).join(', ')}</td>
                        <td>{p.weeksFromStart ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </DetailPanel>
        {editingService && (
          <EditServiceModal
            service={editingService}
            onClose={() => setEditingService(null)}
            onUpdated={svc => { setServices(prev => prev.map(s => s._id === svc._id ? svc : s)); setSelectedService(svc); setEditingService(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

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
                  <tr key={s._id} className={`${!isActive ? styles.rowCancelled : ''} ${styles.trClickable}`} onClick={() => setSelectedService(s)}>
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
                        onClick={(e) => { e.stopPropagation(); setEditingService(s); }}
                      >
                        Edit
                      </button>
                      {isActive ? (
                        <button
                          className={styles.btnWarn}
                          onClick={(e) => { e.stopPropagation(); setConfirmId(s._id); setErrorMsg(null); }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className={styles.btnSuccess}
                          onClick={(e) => { e.stopPropagation(); handleActivate(s._id); }}
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

function CreateUserModal({ onClose, onCreated, shippers }: {
  onClose: () => void;
  onCreated: (u: AdminUser) => void;
  shippers: AdminShipper[];
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('SHIPPING_PLANNER');
  const [company, setCompany] = useState('');
  const [port, setPort] = useState('');
  const [canSend, setCanSend] = useState(false);
  const [shipperId, setShipperId] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!email.trim() || !name.trim()) {
      setError('Email and name are required');
      return;
    }
    setError(null);
    const selectedShipper = shippers.find(s => s._id === shipperId);
    startTransition(async () => {
      const result = await createUser({
        email: email.trim(),
        name: name.trim(),
        role,
        company: company.trim() || undefined,
        port: port.trim() || undefined,
        canSendEmailsToCaptains: canSend,
        shipperId: role === 'EXPORTER' ? shipperId || undefined : undefined,
        shipperCode: role === 'EXPORTER' ? selectedShipper?.code || undefined : undefined,
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
              <label className={styles.formLabel}>Linked Shipper *</label>
              <select
                className={styles.formSelect}
                value={shipperId}
                onChange={e => setShipperId(e.target.value)}
              >
                <option value="">— Select shipper —</option>
                {shippers.filter(s => s.active !== false).map(s => (
                  <option key={s._id} value={s._id}>{s.code} — {s.name}</option>
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

function EditUserModal({ user, onClose, onUpdated, shippers }: {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (u: AdminUser) => void;
  shippers: AdminShipper[];
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [company, setCompany] = useState(user.company);
  const [port, setPort] = useState(user.port);
  const [canSend, setCanSend] = useState(user.canSendEmailsToCaptains);
  const [shipperId, setShipperId] = useState(user.shipperId ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    const selectedShipper = shippers.find(s => s._id === shipperId);
    startTransition(async () => {
      const result = await updateUser(user._id, {
        name: name.trim(),
        role,
        company: company.trim(),
        port: port.trim(),
        canSendEmailsToCaptains: canSend,
        shipperId: role === 'EXPORTER' ? shipperId || null : null,
        shipperCode: role === 'EXPORTER' ? selectedShipper?.code ?? '' : '',
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
              <label className={styles.formLabel}>Linked Shipper</label>
              <select
                className={styles.formSelect}
                value={shipperId}
                onChange={e => setShipperId(e.target.value)}
              >
                <option value="">— None —</option>
                {shippers.filter(s => s.active !== false).map(s => (
                  <option key={s._id} value={s._id}>{s.code} — {s.name}</option>
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

function UsersTab({ initialUsers, initialShippers }: { initialUsers: AdminUser[]; initialShippers: AdminShipper[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [shippers] = useState<AdminShipper[]>(initialShippers);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

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

  if (selectedUser) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedUser.name}
          onBack={() => setSelectedUser(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingUser(selectedUser)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Full Name" value={selectedUser.name} />
            <DRow label="Email" value={selectedUser.email} mono />
            <DRow label="Role" value={
              <span className={styles.badge} style={{
                background: selectedUser.role === 'ADMIN' ? 'var(--color-warning-muted)' : 'var(--color-bg-tertiary)',
                color: selectedUser.role === 'ADMIN' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
              }}>{roleLabel(selectedUser.role)}</span>
            } />
            <DRow label="Company" value={selectedUser.company} />
            <DRow label="Port" value={selectedUser.port} />
            <DRow label="Linked Shipper" value={(() => {
              const s = shippers.find(sh => sh._id === selectedUser.shipperId);
              return s ? `${s.code} — ${s.name}` : (selectedUser.shipperCode || undefined);
            })()} mono />
            <DRow label="Email Status" value={
              selectedUser.emailConfirmed
                ? <span className={styles.badge} style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}>Confirmed</span>
                : <span className={styles.badge} style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)' }}>Pending</span>
            } />
            <DRow label="Last Login" value={selectedUser.lastLogin ? fmtDate(selectedUser.lastLogin) : undefined} />
            <DRow label="Created" value={fmtDate(selectedUser.createdAt ?? undefined)} />
          </div>
        </DetailPanel>
        {editingUser && (
          <EditUserModal
            user={editingUser}
            shippers={shippers}
            onClose={() => setEditingUser(null)}
            onUpdated={updated => { setUsers(prev => prev.map(u => u._id === updated._id ? updated : u)); setSelectedUser(updated); setEditingUser(null); }}
          />
        )}
      </div>
    );
  }

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
                <tr key={u._id} className={styles.trClickable} onClick={() => setSelectedUser(u)}>
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
                        onClick={(e) => { e.stopPropagation(); handleResend(u._id); }}
                        disabled={resendingId === u._id || isPending}
                        title="Resend invitation email"
                      >
                        {resendingId === u._id ? 'Sending…' : 'Resend'}
                      </button>
                    )}
                    <button className={styles.btnSm} onClick={(e) => { e.stopPropagation(); setEditingUser(u); }}>
                      Edit
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={(e) => { e.stopPropagation(); setConfirmId(u._id); setErrorMsg(null); }}
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
          shippers={shippers}
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
          shippers={shippers}
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

function CreatePortModal({ unecePorts, onClose, onCreated }: {
  unecePorts: UnecePort[];
  onClose: () => void;
  onCreated: (p: AdminPort) => void;
}) {
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedUnlocode, setSelectedUnlocode] = useState('');
  const [weatherCity, setWeatherCity] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Unique sorted countries from UNECE reference data — sorted by full country name
  const countries = useMemo(() => {
    const seen = new Set<string>();
    return unecePorts
      .filter(p => { if (seen.has(p.countryCode)) return false; seen.add(p.countryCode); return true; })
      .map(p => ({ countryCode: p.countryCode, country: p.country }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [unecePorts]);

  // Ports available for the selected country
  const portsForCountry = useMemo(
    () => unecePorts.filter(p => p.countryCode === selectedCountry).sort((a, b) => a.portName.localeCompare(b.portName)),
    [unecePorts, selectedCountry]
  );

  // The selected UNECE record
  const selected = useMemo(
    () => unecePorts.find(p => p.unlocode === selectedUnlocode) ?? null,
    [unecePorts, selectedUnlocode]
  );

  const handleCountryChange = (cc: string) => {
    setSelectedCountry(cc);
    setSelectedUnlocode('');
    setWeatherCity('');
  };

  const handlePortChange = (unlocode: string) => {
    setSelectedUnlocode(unlocode);
    const port = unecePorts.find(p => p.unlocode === unlocode);
    if (port) setWeatherCity(port.portName);
  };

  const handleSubmit = () => {
    if (!selected) { setError('Select a port'); return; }
    if (!weatherCity.trim()) { setError('Weather city is required'); return; }
    setError(null);
    startTransition(async () => {
      const result = await createPort({
        unlocode:    selected.unlocode,
        countryCode: selected.countryCode,
        country:     selected.country,
        portName:    selected.portName,
        weatherCity: weatherCity.trim(),
        latitude:    selected.latitude,
        longitude:   selected.longitude,
      });
      if (result.success) {
        onCreated(result.data as AdminPort);
      } else {
        setError(result.error ?? 'Failed to add port');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Add Port</h3>
        <div className={styles.formGrid}>

          {/* Step 1: Country */}
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Country *</label>
            <select className={styles.formSelect} value={selectedCountry} onChange={e => handleCountryChange(e.target.value)}>
              <option value="">— Select country —</option>
              {countries.map(c => (
                <option key={c.countryCode} value={c.countryCode}>{c.country}</option>
              ))}
            </select>
          </div>

          {/* Step 2: Port (dependent on country) */}
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Select Port *</label>
            <select
              className={styles.formSelect}
              value={selectedUnlocode}
              onChange={e => handlePortChange(e.target.value)}
              disabled={!selectedCountry}
            >
              <option value="">— Select port —</option>
              {portsForCountry.map(p => (
                <option key={p.unlocode} value={p.unlocode}>{p.portName}</option>
              ))}
            </select>
          </div>

          {/* Auto-filled fields — shown once a port is selected */}
          {selected && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>UNLOCODE</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={selected.unlocode}
                  readOnly
                  style={{ opacity: 0.7 }}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Weather City *</label>
                <input
                  className={styles.formInput}
                  value={weatherCity}
                  onChange={e => setWeatherCity(e.target.value)}
                  maxLength={100}
                />
                <span className={styles.formHint}>Auto-filled from port name. Edit only if city differs.</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Latitude</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={selected.latitude ?? ''}
                  readOnly
                  style={{ opacity: 0.7 }}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Longitude</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={selected.longitude ?? ''}
                  readOnly
                  style={{ opacity: 0.7 }}
                />
              </div>
            </>
          )}

        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !selected || !weatherCity.trim()}
          >
            {isPending ? 'Adding…' : 'Add Port'}
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
  const [portName, setPortName]       = useState(port.portName);
  const [country, setCountry]         = useState(port.country);
  const [weatherCity, setWeatherCity] = useState(port.weatherCity);
  const [latitude, setLatitude]       = useState(port.latitude != null ? String(port.latitude) : '');
  const [longitude, setLongitude]     = useState(port.longitude != null ? String(port.longitude) : '');
  const [active, setActive]           = useState(port.active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!portName.trim() || !weatherCity.trim()) {
      setError('Port Name and Weather City are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePort(port._id, {
        portName:    portName.trim(),
        country:     country.trim(),
        weatherCity: weatherCity.trim(),
        latitude:    latitude ? parseFloat(latitude) : undefined,
        longitude:   longitude ? parseFloat(longitude) : undefined,
        active,
      });
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
        <h3 className={styles.modalTitle}>Edit Port — {port.unlocode}</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>UNLOCODE</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={port.unlocode} readOnly disabled />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country Code</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={port.countryCode} readOnly disabled />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Port Name *</label>
            <input className={styles.formInput} value={portName} onChange={e => setPortName(e.target.value)} maxLength={100} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country (full name)</label>
            <input className={styles.formInput} value={country} onChange={e => setCountry(e.target.value)} maxLength={100} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>City (for weather data) *</label>
            <input className={styles.formInput} value={weatherCity} onChange={e => setWeatherCity(e.target.value)} maxLength={100} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Latitude</label>
            <input className={styles.formInput} type="number" step="0.0001" value={latitude} onChange={e => setLatitude(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Longitude</label>
            <input className={styles.formInput} type="number" step="0.0001" value={longitude} onChange={e => setLongitude(e.target.value)} />
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

function PortsTab({ initialPorts, unecePorts }: { initialPorts: AdminPort[]; unecePorts: UnecePort[] }) {
  const router = useRouter();
  const [ports, setPorts] = useState<AdminPort[]>(initialPorts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPort, setEditingPort] = useState<AdminPort | null>(null);
  const [isImporting, startImport] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<AdminPort | null>(null);

  const handleImportAll = () => {
    if (!confirm(`This will DELETE all ${ports.length} current port records and re-import all ${unecePorts.length} ports from the UNECE master list. Continue?`)) return;
    setImportError(null);
    startImport(async () => {
      const result = await importAllPortsFromUnece();
      if (result.success && result.data) {
        setPorts(result.data as AdminPort[]);
        router.refresh();
      } else {
        setImportError((result as any).error ?? 'Import failed');
      }
    });
  };

  if (selectedPort) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedPort.unlocode}
          onBack={() => setSelectedPort(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingPort(selectedPort)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="UNLOCODE" value={<code>{selectedPort.unlocode}</code>} />
            <DRow label="Country Code" value={selectedPort.countryCode} mono />
            <DRow label="Port Name" value={selectedPort.portName} />
            <DRow label="Country" value={selectedPort.country} />
            <DRow label="Weather City" value={selectedPort.weatherCity} />
            <DRow label="Latitude" value={selectedPort.latitude} />
            <DRow label="Longitude" value={selectedPort.longitude} />
            <DRow label="Status" value={
              <span className={styles.badge} style={{
                background: selectedPort.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                color: selectedPort.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              }}>{selectedPort.active ? 'Active' : 'Inactive'}</span>
            } />
          </div>
        </DetailPanel>
        {editingPort && (
          <EditPortModal
            port={editingPort}
            onClose={() => setEditingPort(null)}
            onUpdated={p => { setPorts(prev => prev.map(x => x._id === p._id ? p : x)); setSelectedPort(p); setEditingPort(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{ports.length} ports</span>
          {unecePorts.length > 0 && (
            <button
              className={styles.btnSm}
              onClick={handleImportAll}
              disabled={isImporting}
              title={`Clear current ports and import all ${unecePorts.length} ports from UNECE master data`}
            >
              {isImporting ? 'Importing…' : `Import all from UNECE (${unecePorts.length})`}
            </button>
          )}
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          + New Port
        </button>
      </div>

      {importError && (
        <div className={styles.modalError} style={{ marginBottom: '1rem' }}>{importError}</div>
      )}

      {unecePorts.length === 0 && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'var(--color-warning-muted, #fef3c7)', borderRadius: '6px', fontSize: 'var(--text-sm)', color: 'var(--color-warning, #92400e)' }}>
          UNECE master data is not loaded. Run <code>npm run db:seed:ports</code> to populate the reference list, then refresh.
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>UNLOCODE</th>
              <th>Port Name</th>
              <th>Country</th>
              <th>City (weather)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ports.map(p => (
              <tr key={p._id} style={{ opacity: p.active ? 1 : 0.5 }} className={styles.trClickable} onClick={() => setSelectedPort(p)}>
                <td><code>{p.unlocode}</code></td>
                <td>{p.portName}</td>
                <td>{p.country}</td>
                <td>{p.weatherCity}</td>
                <td>
                  <span className={styles.badge} style={{
                    background: p.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                    color: p.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className={styles.btnSm} onClick={(e) => { e.stopPropagation(); setEditingPort(p); }}>Edit</button>
                </td>
              </tr>
            ))}
            {ports.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No ports yet. Use "Import all from UNECE" or create one manually.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreatePortModal
          unecePorts={unecePorts}
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
// Shippers Tab
// ---------------------------------------------------------------------------

function CreateShipperModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (s: AdminShipper) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim() || !code.trim() || !contact.trim() || !email.trim() || !country.trim()) {
      setError('Name, Code, Contact, Email and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createShipper({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        contact: contact.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        country: country.trim(),
      });
      if (result.success) {
        onCreated(result.data as AdminShipper);
      } else {
        setError(result.error ?? 'Failed to create shipper');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New Shipper</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Company Name *</label>
            <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} placeholder="Frutas Caribe S.A." maxLength={200} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code * (unique)</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="FRUTCAR" maxLength={20} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="CO" maxLength={100} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Contact Person *</label>
            <input className={styles.formInput} value={contact} onChange={e => setContact(e.target.value)} placeholder="Juan García" maxLength={200} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email *</label>
            <input className={styles.formInput} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@shipper.com" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Phone</label>
            <input className={styles.formInput} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 310 000 0000" maxLength={50} />
          </div>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={isPending || !name.trim() || !code.trim() || !email.trim()}>
            {isPending ? 'Creating…' : 'Create Shipper'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditShipperModal({ shipper, onClose, onUpdated }: {
  shipper: AdminShipper;
  onClose: () => void;
  onUpdated: (s: AdminShipper) => void;
}) {
  const [name, setName] = useState(shipper.name);
  const [code, setCode] = useState(shipper.code);
  const [contact, setContact] = useState(shipper.contact);
  const [email, setEmail] = useState(shipper.email);
  const [phone, setPhone] = useState(shipper.phone ?? '');
  const [country, setCountry] = useState(shipper.country);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim() || !code.trim() || !contact.trim() || !email.trim() || !country.trim()) {
      setError('Name, Code, Contact, Email and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateShipper(shipper._id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        contact: contact.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        country: country.trim(),
      });
      if (result.success) {
        onUpdated(result.data as AdminShipper);
      } else {
        setError(result.error ?? 'Failed to save shipper');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit Shipper — {shipper.name}</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Company Name *</label>
            <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} maxLength={200} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={20} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <input className={`${styles.formInput} ${styles.formInputMono}`} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} maxLength={100} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Contact Person *</label>
            <input className={styles.formInput} value={contact} onChange={e => setContact(e.target.value)} maxLength={200} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email *</label>
            <input className={styles.formInput} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Phone</label>
            <input className={styles.formInput} value={phone} onChange={e => setPhone(e.target.value)} maxLength={50} />
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

function ShippersTab({ initialShippers }: { initialShippers: AdminShipper[] }) {
  const router = useRouter();
  const [shippers, setShippers] = useState<AdminShipper[]>(initialShippers);
  const [showCreate, setShowCreate] = useState(false);
  const [editingShipper, setEditingShipper] = useState<AdminShipper | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminShipper | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedShipper, setSelectedShipper] = useState<AdminShipper | null>(null);

  const handleDeactivate = () => {
    if (!confirmDeactivate) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deactivateShipper(confirmDeactivate._id);
      if (result.success) {
        setShippers(prev => prev.map(s => s._id === confirmDeactivate._id ? { ...s, active: false } : s));
        setConfirmDeactivate(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Failed to deactivate shipper');
      }
    });
  };

  if (selectedShipper) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={selectedShipper.name}
          onBack={() => setSelectedShipper(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingShipper(selectedShipper)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Company Name" value={selectedShipper.name} />
            <DRow label="Code" value={<code>{selectedShipper.code}</code>} />
            <DRow label="Country" value={selectedShipper.country} />
            <DRow label="Contact Person" value={selectedShipper.contact} />
            <DRow label="Email" value={selectedShipper.email} mono />
            <DRow label="Phone" value={selectedShipper.phone} />
            <DRow label="Status" value={
              <span className={styles.badge} style={{
                background: selectedShipper.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                color: selectedShipper.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              }}>{selectedShipper.active ? 'Active' : 'Inactive'}</span>
            } />
          </div>
        </DetailPanel>
        {editingShipper && (
          <EditShipperModal
            shipper={editingShipper}
            onClose={() => setEditingShipper(null)}
            onUpdated={s => { setShippers(prev => prev.map(x => x._id === s._id ? s : x)); setSelectedShipper(s); setEditingShipper(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{shippers.length} shippers</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ New Shipper</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Country</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Status</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shippers.map(s => (
              <tr key={s._id} style={{ opacity: s.active ? 1 : 0.5 }} className={styles.trClickable} onClick={() => setSelectedShipper(s)}>
                <td style={{ fontWeight: 'var(--weight-medium)' }}>{s.name}</td>
                <td><code>{s.code}</code></td>
                <td>{s.country}</td>
                <td className={styles.cellSecondary}>{s.contact}</td>
                <td className={styles.cellMono}>{s.email}</td>
                <td>
                  <span className={styles.badge} style={{
                    background: s.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                    color: s.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={styles.cellActions}>
                  <button className={styles.btnSm} onClick={(e) => { e.stopPropagation(); setEditingShipper(s); }}>Edit</button>
                  {s.active && (
                    <button className={styles.btnWarn} onClick={(e) => { e.stopPropagation(); setConfirmDeactivate(s); setErrorMsg(null); }}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
            {shippers.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No shippers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDeactivate && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Deactivate Shipper</h3>
            <div className={styles.modalVoyageInfo}>
              <span className={styles.modalVoyageNumber}>{confirmDeactivate.name}</span>
              <code style={{ fontSize: '0.8em', opacity: 0.7 }}>{confirmDeactivate.code}</code>
            </div>
            <p className={styles.modalBody}>
              Deactivating this shipper hides it from dropdown menus. Existing bookings and contracts are not affected.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmDeactivate(null)} disabled={isPending}>Cancel</button>
              <button className={styles.btnModalWarn} onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating…' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateShipperModal
          onClose={() => setShowCreate(false)}
          onCreated={s => { setShippers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name))); setShowCreate(false); router.refresh(); }}
        />
      )}
      {editingShipper && (
        <EditShipperModal
          shipper={editingShipper}
          onClose={() => setEditingShipper(null)}
          onUpdated={s => { setShippers(prev => prev.map(x => x._id === s._id ? s : x)); setEditingShipper(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offices Tab
// ---------------------------------------------------------------------------

function CreateOfficeModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (o: AdminOffice) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!code.trim() || !name.trim() || !country.trim()) {
      setError('Code, Name and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createOffice({
        code: code.trim(),
        name: name.trim(),
        country: country.trim(),
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      if (result.success) {
        onCreated(result.data as AdminOffice);
      } else {
        setError(result.error ?? 'Failed to create office');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New Office</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code * <span style={{ fontWeight: 400, opacity: 0.6 }}>(3 chars)</span></label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="VLP"
              maxLength={3}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <input
              className={styles.formInput}
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder="Chile"
              maxLength={100}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Valparaíso Office"
              maxLength={100}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Contact Name</label>
            <input
              className={styles.formInput}
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={150}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Email</label>
            <input
              className={styles.formInput}
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="jane.doe@office.com"
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Phone</label>
            <input
              className={styles.formInput}
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              maxLength={30}
            />
          </div>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !code.trim() || !name.trim() || !country.trim()}
          >
            {isPending ? 'Creating…' : 'Create Office'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditOfficeModal({ office, onClose, onUpdated }: {
  office: AdminOffice;
  onClose: () => void;
  onUpdated: (o: AdminOffice) => void;
}) {
  const [name, setName] = useState(office.name);
  const [country, setCountry] = useState(office.country);
  const [contactName, setContactName] = useState(office.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(office.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(office.contactPhone ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim() || !country.trim()) {
      setError('Name and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateOffice(office._id, {
        name: name.trim(),
        country: country.trim(),
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      if (result.success) {
        onUpdated(result.data as AdminOffice);
      } else {
        setError(result.error ?? 'Failed to save office');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit Office — <code>{office.code}</code></h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Code</label>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              value={office.code}
              disabled
              style={{ opacity: 0.5 }}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <input
              className={styles.formInput}
              value={country}
              onChange={e => setCountry(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Contact Name</label>
            <input
              className={styles.formInput}
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={150}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Email</label>
            <input
              className={styles.formInput}
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="jane.doe@office.com"
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Phone</label>
            <input
              className={styles.formInput}
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              maxLength={30}
            />
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

function OfficesTab({ initialOffices }: { initialOffices: AdminOffice[] }) {
  const router = useRouter();
  const [offices, setOffices] = useState<AdminOffice[]>(initialOffices);
  const [showCreate, setShowCreate] = useState(false);
  const [editingOffice, setEditingOffice] = useState<AdminOffice | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminOffice | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedOffice, setSelectedOffice] = useState<AdminOffice | null>(null);

  const handleDeactivate = () => {
    if (!confirmDeactivate) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteOffice(confirmDeactivate._id);
      if (result.success) {
        setOffices(prev => prev.map(o => o._id === confirmDeactivate._id ? { ...o, active: false } : o));
        setConfirmDeactivate(null);
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Failed to deactivate office');
      }
    });
  };

  if (selectedOffice) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={`${selectedOffice.code} — ${selectedOffice.name}`}
          onBack={() => setSelectedOffice(null)}
          actions={
            <button className={styles.btnSm} onClick={() => setEditingOffice(selectedOffice)}>Edit</button>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Code" value={<code>{selectedOffice.code}</code>} />
            <DRow label="Office Name" value={selectedOffice.name} />
            <DRow label="Country" value={selectedOffice.country} />
            <DRow label="Status" value={
              <span className={styles.badge} style={{
                background: selectedOffice.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                color: selectedOffice.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              }}>{selectedOffice.active ? 'Active' : 'Inactive'}</span>
            } />
            <DRow label="Contact Name" value={selectedOffice.contactName} />
            <DRow label="Contact Email" value={selectedOffice.contactEmail} mono />
            <DRow label="Contact Phone" value={selectedOffice.contactPhone} />
            <DRow label="Created" value={fmtDate(selectedOffice.createdAt)} />
          </div>
        </DetailPanel>
        {editingOffice && (
          <EditOfficeModal
            office={editingOffice}
            onClose={() => setEditingOffice(null)}
            onUpdated={o => { setOffices(prev => prev.map(x => x._id === o._id ? o : x)); setSelectedOffice(o); setEditingOffice(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{offices.length} offices</span>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ New Office</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Country</th>
              <th>Contact</th>
              <th>Status</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {offices.map(o => (
              <tr key={o._id} style={{ opacity: o.active ? 1 : 0.5 }} className={styles.trClickable} onClick={() => setSelectedOffice(o)}>
                <td><code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{o.code}</code></td>
                <td style={{ fontWeight: 'var(--weight-medium)' }}>{o.name}</td>
                <td className={styles.cellSecondary}>{o.country}</td>
                <td className={styles.cellSecondary} style={{ fontSize: '0.8125rem' }}>
                  {o.contactName && <div style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' }}>{o.contactName}</div>}
                  {o.contactEmail && <div>{o.contactEmail}</div>}
                  {o.contactPhone && <div>{o.contactPhone}</div>}
                  {!o.contactName && !o.contactEmail && !o.contactPhone && <span style={{ opacity: 0.4 }}>—</span>}
                </td>
                <td>
                  <span className={styles.badge} style={{
                    background: o.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                    color: o.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}>
                    {o.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={styles.cellActions}>
                  <button className={styles.btnSm} onClick={(e) => { e.stopPropagation(); setEditingOffice(o); }}>Edit</button>
                  {o.active && (
                    <button
                      className={styles.btnWarn}
                      onClick={(e) => { e.stopPropagation(); setConfirmDeactivate(o); setErrorMsg(null); }}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {offices.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No offices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDeactivate && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Deactivate Office</h3>
            <div className={styles.modalVoyageInfo}>
              <code className={styles.modalVoyageNumber}>{confirmDeactivate.code}</code>
              <span style={{ opacity: 0.7 }}>{confirmDeactivate.name}</span>
            </div>
            <p className={styles.modalBody}>
              Deactivating this office hides it from dropdown menus. Existing contracts are not affected.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmDeactivate(null)} disabled={isPending}>Cancel</button>
              <button className={styles.btnModalWarn} onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating…' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateOfficeModal
          onClose={() => setShowCreate(false)}
          onCreated={o => {
            setOffices(prev => [...prev, o].sort((a, b) => a.code.localeCompare(b.code)));
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}
      {editingOffice && (
        <EditOfficeModal
          office={editingOffice}
          onClose={() => setEditingOffice(null)}
          onUpdated={o => {
            setOffices(prev => prev.map(x => x._id === o._id ? o : x));
            setEditingOffice(null);
            router.refresh();
          }}
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
  { id: 'shippers',  label: 'Shippers'      },
  { id: 'offices',   label: 'Offices'       },
  { id: 'bookings',  label: 'Bookings'      },
  { id: 'customers', label: 'Customers'     },
];

interface AdminClientProps {
  voyages: AdminVoyage[];
  contracts: DisplayContract[];
  offices: AdminOffice[];
  services: any[];
  plans: AdminPlan[];
  vessels: AdminVessel[];
  users: AdminUser[];
  ports: AdminPort[];
  shippers: AdminShipper[];
  unecePorts: UnecePort[];
  bookings: AdminBooking[];
  customers: AdminCustomer[];
  initialTab?: string;
}

export default function AdminClient({ voyages, contracts, offices, services, plans, vessels, users, ports, shippers, unecePorts, bookings, customers, initialTab = 'voyages' }: AdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || 'voyages');

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

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
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tabBtn} ${activeTab === t.id ? styles['tabBtn--active'] : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'voyages'   && <VoyagesTab initialVoyages={voyages} />}
      {activeTab === 'contracts' && (
        <div className={styles.tabContent}>
          <ContractsClient contracts={contracts} offices={offices.filter(o => o.active)} services={services} shippers={shippers} adminMode />
        </div>
      )}
      {activeTab === 'plans'    && <PlansTab initialPlans={plans} />}
      {activeTab === 'vessels'  && <VesselsTab initialVessels={vessels} />}
      {activeTab === 'services' && <ServicesTab initialServices={services as AdminService[]} />}
      {activeTab === 'users'    && <UsersTab initialUsers={users} initialShippers={shippers} />}
      {activeTab === 'ports'    && <PortsTab initialPorts={ports} unecePorts={unecePorts} />}
      {activeTab === 'shippers' && <ShippersTab initialShippers={shippers} />}
      {activeTab === 'offices'  && <OfficesTab initialOffices={offices} />}
      {activeTab === 'bookings'  && <BookingsTab initialBookings={bookings} />}
      {activeTab === 'customers' && <CustomersTab initialCustomers={customers} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers Tab
// ---------------------------------------------------------------------------

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  CONSIGNEE: 'Consignee',
  SHIPPER:   'Shipper',
  AGENT:     'Agent',
};

function CreateCustomerModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (c: AdminCustomer) => void;
}) {
  const [name, setName]               = useState('');
  const [type, setType]               = useState<'CONSIGNEE' | 'SHIPPER' | 'AGENT'>('CONSIGNEE');
  const [countryCode, setCountryCode] = useState('');
  const [country, setCountry]         = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress]         = useState('');
  const [notes, setNotes]             = useState('');
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);

  // When CountrySelect sets a code, also store the resolved name for the server
  const [countryOptions, setCountryOptions] = useState<{ code: string; name: string; flag: string }[]>([]);
  useEffect(() => {
    getCountries().then(setCountryOptions);
  }, []);

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    const found = countryOptions.find(c => c.code === code);
    setCountry(found?.name ?? '');
  };

  const handleSubmit = () => {
    if (!name.trim() || !countryCode || !type) {
      setError('Name, Type and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCustomer({
        name:         name.trim(),
        type,
        countryCode,
        country,
        contactName:  contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        address:      address.trim() || undefined,
        notes:        notes.trim() || undefined,
      });
      if (result.success) {
        onCreated(result.customer as AdminCustomer);
      } else {
        setError(result.error ?? 'Failed to create customer');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New Customer</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Del Monte Fresh Produce"
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Type *</label>
            <select className={styles.formInput} value={type} onChange={e => setType(e.target.value as any)}>
              <option value="CONSIGNEE">Consignee</option>
              <option value="SHIPPER">Shipper</option>
              <option value="AGENT">Agent</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <CountrySelect value={countryCode} onChange={handleCountryChange} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Name</label>
            <input
              className={styles.formInput}
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={150}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Email</label>
            <input
              className={styles.formInput}
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="jane@example.com"
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Phone</label>
            <input
              className={styles.formInput}
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              maxLength={30}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Address</label>
            <input
              className={styles.formInput}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Harbor Blvd, Port City"
              maxLength={500}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Notes</label>
            <textarea
              className={styles.formInput}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || !countryCode}
          >
            {isPending ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCustomerModal({ customer, onClose, onUpdated }: {
  customer: AdminCustomer;
  onClose: () => void;
  onUpdated: (c: AdminCustomer) => void;
}) {
  const [name, setName]               = useState(customer.name);
  const [type, setType]               = useState<'CONSIGNEE' | 'SHIPPER' | 'AGENT'>(customer.type);
  const [countryCode, setCountryCode] = useState(customer.countryCode);
  const [country, setCountry]         = useState(customer.country);
  const [contactName, setContactName] = useState(customer.contactName);
  const [contactEmail, setContactEmail] = useState(customer.contactEmail);
  const [contactPhone, setContactPhone] = useState(customer.contactPhone);
  const [address, setAddress]         = useState(customer.address);
  const [notes, setNotes]             = useState(customer.notes);
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);

  const [countryOptions, setCountryOptions] = useState<{ code: string; name: string; flag: string }[]>([]);
  useEffect(() => {
    getCountries().then(setCountryOptions);
  }, []);

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    const found = countryOptions.find(c => c.code === code);
    setCountry(found?.name ?? country);
  };

  const handleSave = () => {
    if (!name.trim() || !countryCode) {
      setError('Name and Country are required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateCustomer(customer._id, {
        name:         name.trim(),
        type,
        countryCode,
        country,
        contactName:  contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        address:      address.trim() || undefined,
        notes:        notes.trim() || undefined,
      });
      if (result.success) {
        onUpdated(result.customer as AdminCustomer);
      } else {
        setError(result.error ?? 'Failed to save customer');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit Customer — <code>{customer.customerNumber}</code></h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Name *</label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Type *</label>
            <select className={styles.formInput} value={type} onChange={e => setType(e.target.value as any)}>
              <option value="CONSIGNEE">Consignee</option>
              <option value="SHIPPER">Shipper</option>
              <option value="AGENT">Agent</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Country *</label>
            <CountrySelect value={countryCode} onChange={handleCountryChange} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Name</label>
            <input
              className={styles.formInput}
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              maxLength={150}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Email</label>
            <input
              className={styles.formInput}
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Contact Phone</label>
            <input
              className={styles.formInput}
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Address</label>
            <input
              className={styles.formInput}
              value={address}
              onChange={e => setAddress(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Notes</label>
            <textarea
              className={styles.formInput}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={1000}
            />
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

function CustomersTab({ initialCustomers }: { initialCustomers: AdminCustomer[] }) {
  const router = useRouter();
  const [customers, setCustomers]         = useState<AdminCustomer[]>(initialCustomers);
  const [showCreate, setShowCreate]       = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminCustomer | null>(null);
  const [selectedCustomer, setSelectedCustomer]   = useState<AdminCustomer | null>(null);
  const [typeFilter, setTypeFilter]       = useState('ALL');
  const [isPending, startTransition]      = useTransition();
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  const filtered = typeFilter === 'ALL'
    ? customers
    : customers.filter(c => c.type === typeFilter);

  const handleDeactivate = () => {
    if (!confirmDeactivate) return;
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deactivateCustomer(confirmDeactivate._id);
      if (result.success) {
        setCustomers(prev => prev.map(c => c._id === confirmDeactivate._id ? { ...c, active: false } : c));
        setConfirmDeactivate(null);
        if (selectedCustomer?._id === confirmDeactivate._id) {
          setSelectedCustomer(prev => prev ? { ...prev, active: false } : prev);
        }
        router.refresh();
      } else {
        setErrorMsg(result.error ?? 'Failed to deactivate');
      }
    });
  };

  if (selectedCustomer) {
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={`${selectedCustomer.customerNumber} — ${selectedCustomer.name}`}
          onBack={() => setSelectedCustomer(null)}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className={styles.btnSm} onClick={() => setEditingCustomer(selectedCustomer)}>Edit</button>
              {selectedCustomer.active && (
                <button className={styles.btnWarn} onClick={() => { setConfirmDeactivate(selectedCustomer); setErrorMsg(null); }}>
                  Deactivate
                </button>
              )}
            </div>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Customer #" value={<code>{selectedCustomer.customerNumber}</code>} mono />
            <DRow label="Type" value={CUSTOMER_TYPE_LABELS[selectedCustomer.type]} />
            <DRow label="Name" value={selectedCustomer.name} />
            <DRow label="Country" value={`${selectedCustomer.country} (${selectedCustomer.countryCode})`} />
            <DRow label="Status" value={
              <span className={styles.badge} style={{
                background: selectedCustomer.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                color: selectedCustomer.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              }}>{selectedCustomer.active ? 'Active' : 'Inactive'}</span>
            } />
            <DRow label="Contact Name"  value={selectedCustomer.contactName  || undefined} />
            <DRow label="Contact Email" value={selectedCustomer.contactEmail || undefined} mono />
            <DRow label="Contact Phone" value={selectedCustomer.contactPhone || undefined} />
            <DRow label="Address" value={selectedCustomer.address || undefined} full />
            <DRow label="Notes"   value={selectedCustomer.notes   || undefined} full />
            <DRow label="Created By" value={selectedCustomer.createdBy || undefined} />
            <DRow label="Created At"  value={fmtDate(selectedCustomer.createdAt ?? undefined)} />
          </div>
        </DetailPanel>

        {editingCustomer && (
          <EditCustomerModal
            customer={editingCustomer}
            onClose={() => setEditingCustomer(null)}
            onUpdated={c => {
              setCustomers(prev => prev.map(x => x._id === c._id ? c : x));
              setSelectedCustomer(c);
              setEditingCustomer(null);
              router.refresh();
            }}
          />
        )}

        {confirmDeactivate && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <h3 className={styles.modalTitle}>Deactivate Customer</h3>
              <div className={styles.modalVoyageInfo}>
                <code className={styles.modalVoyageNumber}>{confirmDeactivate.customerNumber}</code>
                <span style={{ opacity: 0.7 }}>{confirmDeactivate.name}</span>
              </div>
              <p className={styles.modalBody}>
                Deactivating this customer hides it from dropdown menus. Existing records are not affected.
              </p>
              {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
              <div className={styles.modalActions}>
                <button className={styles.btnModalCancel} onClick={() => setConfirmDeactivate(null)} disabled={isPending}>Cancel</button>
                <button className={styles.btnModalWarn} onClick={handleDeactivate} disabled={isPending}>
                  {isPending ? 'Deactivating…' : 'Yes, Deactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{filtered.length} customers</span>
          <div className={styles.filterGroup}>
            {['ALL', 'CONSIGNEE', 'SHIPPER', 'AGENT'].map(t => (
              <button
                key={t}
                className={`${styles.filterBtn} ${typeFilter === t ? styles['filterBtn--active'] : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'ALL' ? 'All' : CUSTOMER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ New Customer</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Customer #</th>
              <th>Name</th>
              <th>Type</th>
              <th>Country</th>
              <th>Contact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c._id} style={{ opacity: c.active ? 1 : 0.5 }} className={styles.trClickable} onClick={() => setSelectedCustomer(c)}>
                <td><code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8125rem' }}>{c.customerNumber}</code></td>
                <td style={{ fontWeight: 'var(--weight-medium)' }}>{c.name}</td>
                <td>
                  <span className={styles.badge} style={{
                    background: c.type === 'CONSIGNEE' ? 'var(--color-blue-muted)'
                              : c.type === 'SHIPPER'   ? 'var(--color-success-muted)'
                              : 'var(--color-warning-muted)',
                    color: c.type === 'CONSIGNEE' ? 'var(--color-blue-light)'
                         : c.type === 'SHIPPER'   ? 'var(--color-success)'
                         : 'var(--color-warning)',
                  }}>
                    {CUSTOMER_TYPE_LABELS[c.type]}
                  </span>
                </td>
                <td className={styles.cellSecondary}>{c.country}</td>
                <td className={styles.cellSecondary} style={{ fontSize: '0.8125rem' }}>
                  {c.contactName && <div style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' }}>{c.contactName}</div>}
                  {c.contactEmail && <div>{c.contactEmail}</div>}
                  {!c.contactName && !c.contactEmail && <span style={{ opacity: 0.4 }}>—</span>}
                </td>
                <td>
                  <span className={styles.badge} style={{
                    background: c.active ? 'var(--color-success-muted)' : 'var(--color-bg-tertiary)',
                    color: c.active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}>
                    {c.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDeactivate && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Deactivate Customer</h3>
            <div className={styles.modalVoyageInfo}>
              <code className={styles.modalVoyageNumber}>{confirmDeactivate.customerNumber}</code>
              <span style={{ opacity: 0.7 }}>{confirmDeactivate.name}</span>
            </div>
            <p className={styles.modalBody}>
              Deactivating this customer hides it from dropdown menus. Existing records are not affected.
            </p>
            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setConfirmDeactivate(null)} disabled={isPending}>Cancel</button>
              <button className={styles.btnModalWarn} onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating…' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={c => {
            setCustomers(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}

      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onUpdated={c => {
            setCustomers(prev => prev.map(x => x._id === c._id ? c : x));
            setEditingCustomer(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookings Tab
// ---------------------------------------------------------------------------

function BookingsTab({ initialBookings }: { initialBookings: AdminBooking[] }) {
  const router = useRouter();
  const [bookings, setBookings] = useState<AdminBooking[]>(initialBookings);
  const [statusFilter, setStatusFilter] = useState('');
  const [voyageFilter, setVoyageFilter] = useState('');
  const [approveTarget, setApproveTarget] = useState<AdminBooking | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminBooking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);

  const voyageNumbers = useMemo(
    () => [...new Set(bookings.map((b: any) => b.voyageNumber).filter(Boolean))].sort() as string[],
    [bookings]
  );

  const filtered = useMemo(() => {
    return bookings.filter((b: any) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (voyageFilter && b.voyageNumber !== voyageFilter) return false;
      return true;
    });
  }, [bookings, statusFilter, voyageFilter]);

  if (selectedBooking) {
    const b = selectedBooking;
    return (
      <div className={styles.tabContent}>
        <DetailPanel
          title={b.bookingNumber}
          onBack={() => setSelectedBooking(null)}
          actions={
            <>
              {(b.status === 'PENDING' || b.status === 'PARTIAL') && (
                <>
                  <button className={styles.btnSm} onClick={() => setApproveTarget(b)}>Approve</button>
                  <button className={styles.btnWarn} onClick={() => setRejectTarget(b)}>Reject</button>
                </>
              )}
              {b.status !== 'CANCELLED' && b.status !== 'REJECTED' && (
                <button className={styles.btnDanger} onClick={() => setCancelTarget(b)}>Cancel</button>
              )}
            </>
          }
        >
          <div className={styles.detailGrid}>
            <DRow label="Booking #" value={<code>{b.bookingNumber}</code>} />
            <DRow label="Status" value={<BookingStatusBadge status={b.status} />} />
            <DRow label="Voyage" value={b.voyageNumber} />
            <DRow label="Created" value={fmtDate(b.createdAt)} />
            <DRow label="Shipper Name" value={b.shipper?.name} />
            <DRow label="Shipper Code" value={b.shipper?.code} mono />
            <DRow label="Consignee Name" value={b.consignee?.name} />
            <DRow label="Consignee Code" value={b.consignee?.code} mono />
            <DRow label="Cargo Type" value={fmtCargo(b.cargoType || '')} />
            <DRow label="Requested Qty" value={b.requestedQuantity} />
            <DRow label="Confirmed Qty" value={b.confirmedQuantity > 0 ? b.confirmedQuantity : undefined} />
          </div>
        </DetailPanel>
        {approveTarget && (
          <AdminApproveModal
            booking={approveTarget}
            onClose={() => setApproveTarget(null)}
            onDone={updated => { setBookings(prev => prev.map(x => x._id === updated._id ? updated : x)); setSelectedBooking(updated); setApproveTarget(null); router.refresh(); }}
          />
        )}
        {rejectTarget && (
          <AdminRejectModal
            booking={rejectTarget}
            onClose={() => setRejectTarget(null)}
            onDone={updated => { setBookings(prev => prev.map(x => x._id === updated._id ? updated : x)); setSelectedBooking(updated); setRejectTarget(null); router.refresh(); }}
          />
        )}
        {cancelTarget && (
          <AdminCancelModal
            booking={cancelTarget}
            onClose={() => setCancelTarget(null)}
            onDone={updated => { setBookings(prev => prev.map(x => x._id === updated._id ? updated : x)); setSelectedBooking(updated); setCancelTarget(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarCount}>{filtered.length} of {bookings.length} bookings</span>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PARTIAL">Partial</option>
            <option value="STANDBY">Standby</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            className={styles.filterSelect}
            value={voyageFilter}
            onChange={e => setVoyageFilter(e.target.value)}
          >
            <option value="">All Voyages</option>
            {voyageNumbers.map((v: any) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Booking #</th>
              <th>Voyage</th>
              <th>Shipper</th>
              <th>Consignee</th>
              <th>Cargo Type</th>
              <th className={styles.thNum}>Req. Qty</th>
              <th className={styles.thNum}>Conf. Qty</th>
              <th>Status</th>
              <th>Created</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className={styles.emptyCell}>No bookings match the current filters.</td></tr>
            ) : (
              filtered.map((b: any) => (
                <tr key={b._id} className={styles.trClickable} onClick={() => setSelectedBooking(b)}>
                  <td className={styles.cellMono}>{b.bookingNumber}</td>
                  <td className={styles.cellSecondary}>{b.voyageNumber || '—'}</td>
                  <td>{b.shipper?.name || '—'}</td>
                  <td className={styles.cellSecondary}>{b.consignee?.name || '—'}</td>
                  <td>{fmtCargo(b.cargoType || '')}</td>
                  <td className={styles.cellNum}>{b.requestedQuantity ?? '—'}</td>
                  <td className={styles.cellNum}>
                    {b.confirmedQuantity > 0
                      ? <span style={{ color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)' }}>{b.confirmedQuantity}</span>
                      : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    }
                  </td>
                  <td><BookingStatusBadge status={b.status} /></td>
                  <td className={styles.cellMono}>{fmtDate(b.createdAt)}</td>
                  <td className={styles.cellActions}>
                    {(b.status === 'PENDING' || b.status === 'PARTIAL') && (
                      <>
                        <button
                          className={styles.btnSm}
                          onClick={(e) => { e.stopPropagation(); setApproveTarget(b); }}
                          title="Approve booking"
                        >
                          Approve
                        </button>
                        <button
                          className={styles.btnWarn}
                          onClick={(e) => { e.stopPropagation(); setRejectTarget(b); }}
                          title="Reject booking"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {b.status !== 'CANCELLED' && b.status !== 'REJECTED' && (
                      <button
                        className={styles.btnDanger}
                        onClick={(e) => { e.stopPropagation(); setCancelTarget(b); }}
                        title="Cancel booking"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Approve Modal */}
      {approveTarget && (
        <AdminApproveModal
          booking={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={(updated: any) => {
            setBookings((prev: any) => prev.map((b: any) => b._id === updated._id ? { ...b, ...updated } : b));
            setApproveTarget(null);
            router.refresh();
          }}
        />
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <AdminRejectModal
          booking={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={(updated: any) => {
            setBookings((prev: any) => prev.map((b: any) => b._id === updated._id ? { ...b, ...updated } : b));
            setRejectTarget(null);
            router.refresh();
          }}
        />
      )}

      {/* Cancel Modal */}
      {cancelTarget && (
        <AdminCancelModal
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={(updated: any) => {
            setBookings((prev: any) => prev.map((b: any) => b._id === updated._id ? { ...b, ...updated } : b));
            setCancelTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Approve Modal
// ---------------------------------------------------------------------------

function AdminApproveModal({
  booking,
  onClose,
  onDone,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onDone: (updated: any) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmedQty, setConfirmedQty] = useState(booking.requestedQuantity);
  const [error, setError] = useState<string | null>(null);

  const standby = Math.max(0, booking.requestedQuantity - confirmedQty);
  const resultStatus = confirmedQty === 0 ? 'STANDBY' : confirmedQty < booking.requestedQuantity ? 'PARTIAL' : 'CONFIRMED';

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveBooking({ bookingId: booking._id, confirmedQuantity: confirmedQty });
      if (result.success) {
        onDone(result.data);
      } else {
        setError(result.error ?? 'Failed to approve');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Approve Booking</h3>
        <div className={styles.modalVoyageInfo}>
          <span className={styles.modalVoyageNumber}>{booking.bookingNumber}</span>
          <BookingStatusBadge status={booking.status} />
        </div>
        <div className={styles.modalMeta}>
          <span>{booking.shipper?.name || '—'}</span>
          <span>·</span>
          <span>{fmtCargo(booking.cargoType || '')}</span>
          <span>·</span>
          <span>Voyage {booking.voyageNumber}</span>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Confirmed Quantity (requested: {booking.requestedQuantity})</label>
            <input
              type="number"
              className={styles.formInput}
              min={0}
              max={booking.requestedQuantity}
              value={confirmedQty}
              onChange={e => setConfirmedQty(Math.min(parseInt(e.target.value) || 0, booking.requestedQuantity))}
            />
          </div>
          <div className={styles.formGroupFull} style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className={styles.formLabel}>Confirmed</div>
              <div style={{ color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{confirmedQty}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className={styles.formLabel}>Standby</div>
              <div style={{ color: standby > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{standby || '—'}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className={styles.formLabel}>Result</div>
              <BookingStatusBadge status={resultStatus} />
            </div>
          </div>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleApprove}
            disabled={isPending}
          >
            {isPending ? 'Approving…' : 'Confirm Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Reject Modal
// ---------------------------------------------------------------------------

function AdminRejectModal({
  booking,
  onClose,
  onDone,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onDone: (updated: any) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleReject = () => {
    if (!reason.trim()) { setError('Rejection reason is required'); return; }
    setError(null);
    startTransition(async () => {
      const result = await rejectBooking({ bookingId: booking._id, rejectionReason: reason.trim() });
      if (result.success) {
        onDone(result.data);
      } else {
        setError(result.error ?? 'Failed to reject');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Reject Booking</h3>
        <div className={styles.modalVoyageInfo}>
          <span className={styles.modalVoyageNumber}>{booking.bookingNumber}</span>
          <BookingStatusBadge status={booking.status} />
        </div>
        <div className={styles.modalMeta}>
          <span>{booking.shipper?.name || '—'}</span>
          <span>·</span>
          <span>{fmtCargo(booking.cargoType || '')}</span>
          <span>·</span>
          <span>Voyage {booking.voyageNumber}</span>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Rejection Reason *</label>
            <textarea
              className={styles.formInput}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Provide a reason for rejection..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.btnModalDanger}
            onClick={handleReject}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Cancel Modal
// ---------------------------------------------------------------------------

function AdminCancelModal({
  booking,
  onClose,
  onDone,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onDone: (updated: any) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking({ bookingId: booking._id, reason: reason.trim() || undefined });
      if (result.success) {
        onDone(result.data);
      } else {
        setError(result.error ?? 'Failed to cancel');
      }
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Cancel Booking</h3>
        <div className={styles.modalVoyageInfo}>
          <span className={styles.modalVoyageNumber}>{booking.bookingNumber}</span>
          <BookingStatusBadge status={booking.status} />
        </div>
        <div className={styles.modalMeta}>
          <span>{booking.shipper?.name || '—'}</span>
          <span>·</span>
          <span>{fmtCargo(booking.cargoType || '')}</span>
          <span>·</span>
          <span>{booking.requestedQuantity} pallets</span>
        </div>
        <p className={styles.modalBody}>
          This sets the booking status to <strong>CANCELLED</strong>. The record is preserved for audit purposes.
        </p>

        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Cancellation Reason (optional)</label>
            <textarea
              className={styles.formInput}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional reason..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Back</button>
          <button
            className={styles.btnModalWarn}
            onClick={handleCancel}
            disabled={isPending}
          >
            {isPending ? 'Cancelling…' : 'Yes, Cancel Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
