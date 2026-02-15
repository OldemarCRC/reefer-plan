'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cancelVoyage, hardDeleteVoyage } from '@/app/actions/voyage';
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

type Tab = 'voyages' | 'plans' | 'vessels' | 'services' | 'users';

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
    : voyages.filter((v) => v.status === statusFilter);

  const allStatuses = ['ALL', ...Array.from(new Set(voyages.map((v) => v.status))).sort()];

  const handleConfirm = () => {
    if (!confirmAction) return;
    setErrorMsg(null);

    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (confirmAction.type === 'hard-delete') {
        result = await hardDeleteVoyage(confirmAction.voyage._id);
        if (result.success) {
          setVoyages((prev) => prev.filter((v) => v._id !== confirmAction.voyage._id));
          setConfirmAction(null);
          return;
        }
      } else {
        result = await cancelVoyage(confirmAction.voyage._id);
        if (result.success) {
          setVoyages((prev) =>
            prev.map((v) => v._id === confirmAction.voyage._id ? { ...v, status: 'CANCELLED' } : v)
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
            {allStatuses.map((s) => (
              <button
                key={s}
                className={`${styles.filterChip} ${statusFilter === s ? styles['filterChip--active'] : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
                <span className={styles.chipCount}>
                  {s === 'ALL' ? voyages.length : voyages.filter((v) => v.status === s).length}
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
              filtered.map((v) => {
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
// Stub tabs (future)
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
  { id: 'voyages',  label: 'Voyages'       },
  { id: 'plans',    label: 'Stowage Plans' },
  { id: 'vessels',  label: 'Vessels'       },
  { id: 'services', label: 'Services'      },
  { id: 'users',    label: 'Users'         },
];

export default function AdminClient({ voyages }: { voyages: AdminVoyage[] }) {
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
        {TABS.map((t) => (
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
      {activeTab === 'voyages'  && <VoyagesTab initialVoyages={voyages} />}
      {activeTab === 'plans'    && <StubTab label="Stowage Plans" />}
      {activeTab === 'vessels'  && <StubTab label="Vessels" />}
      {activeTab === 'services' && <StubTab label="Services" />}
      {activeTab === 'users'    && <StubTab label="Users" />}
    </div>
  );
}
