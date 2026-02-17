'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { createBookingFromContract, approveBooking, rejectBooking } from '@/app/actions/booking';
import type { CargoType } from '@/types/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const statusStyles: Record<string, { bg: string; color: string }> = {
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PENDING: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  PARTIAL: { bg: 'var(--color-yellow-muted)', color: 'var(--color-yellow)' },
  STANDBY: { bg: 'var(--color-info-muted)', color: 'var(--color-info)' },
  REJECTED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
  CANCELLED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

const cargoColors: Record<string, string> = {
  BANANAS: 'var(--color-yellow)',
  FROZEN_FISH: 'var(--color-blue)',
  TABLE_GRAPES: 'var(--color-success)',
  CITRUS: 'var(--color-warning)',
  AVOCADOS: 'var(--color-success)',
  BERRIES: 'var(--color-danger)',
  KIWIS: 'var(--color-success)',
  OTHER_FROZEN: 'var(--color-blue-light)',
  OTHER_CHILLED: 'var(--color-cyan)',
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: style.bg, color: style.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function EstimateSourceBadge({ source }: { source: string }) {
  if (source === 'SHIPPER_CONFIRMED') {
    return (
      <span className={styles.estimateBadge} style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}>
        Shipper
      </span>
    );
  }
  return (
    <span className={styles.estimateBadge} style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)' }}>
      Contract Est.
    </span>
  );
}

function formatCargo(type: CargoType): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface DisplayBooking {
  _id: string;
  bookingNumber: string;
  voyageNumber: string;
  clientName: string;
  shipperName: string;
  consigneeName: string;
  cargoType: CargoType;
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity: number;
  polCode: string;
  podCode: string;
  status: string;
  estimateSource: string;
}

interface CounterpartyInfo {
  name: string;
  code: string;
  weeklyEstimate: number;
  cargoTypes: CargoType[];
}

export interface ContractOption {
  id: string;
  contractNumber: string;
  clientName: string;
  clientType: 'SHIPPER' | 'CONSIGNEE';
  serviceId: string;
  serviceCode: string;
  officeCode: string;
  originPort: { portCode: string; portName: string; country: string };
  destinationPort: { portCode: string; portName: string; country: string };
  shippers: CounterpartyInfo[];
  consignees: CounterpartyInfo[];
}

export interface VoyageOption {
  id: string;
  voyageNumber: string;
  serviceId: string;
  serviceCode: string;
  vesselName: string;
  departureDate: string;
  status: string;
}

interface BookingRow {
  counterpartyName: string;
  counterpartyCode: string;
  shipperCode: string;
  consigneeCode: string;
  cargoType: CargoType;
  weeklyEstimate: number;
  requestedQuantity: number;
  estimateSource: 'CONTRACT_DEFAULT' | 'SHIPPER_CONFIRMED';
}

interface BookingsClientProps {
  bookings: DisplayBooking[];
  voyageNumbers: string[];
  contracts: ContractOption[];
  voyages: VoyageOption[];
  confirmedCount: number;
  pendingCount: number;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BookingsClient({
  bookings,
  voyageNumbers,
  contracts,
  voyages,
  confirmedCount,
  pendingCount,
}: BookingsClientProps) {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [filterVoyage, setFilterVoyage] = useState('');
  const [filterCargo, setFilterCargo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [approveTarget, setApproveTarget] = useState<DisplayBooking | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DisplayBooking | null>(null);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (filterStatus && b.status !== filterStatus) return false;
      if (filterCargo && b.cargoType !== filterCargo) return false;
      if (filterVoyage && b.voyageNumber !== filterVoyage) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const match =
          b.bookingNumber.toLowerCase().includes(q) ||
          b.clientName.toLowerCase().includes(q) ||
          b.shipperName.toLowerCase().includes(q) ||
          b.consigneeName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bookings, filterStatus, filterCargo, filterVoyage, searchText]);

  const cargoTypes = useMemo(() => {
    return [...new Set(bookings.map((b) => b.cargoType))].sort();
  }, [bookings]);

  return (
    <>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Bookings</h1>
          <p className={styles.pageSubtitle}>
            {bookings.length} total · {confirmedCount} confirmed · {pendingCount} pending action
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
          + New Booking
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search by booking, client, shipper, consignee..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className={styles.select}
          value={filterVoyage}
          onChange={(e) => setFilterVoyage(e.target.value)}
        >
          <option value="">All Voyages</option>
          {voyageNumbers.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterCargo}
          onChange={(e) => setFilterCargo(e.target.value)}
        >
          <option value="">All Cargo</option>
          {cargoTypes.map((ct) => (
            <option key={ct} value={ct}>{formatCargo(ct)}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PARTIAL">Partial</option>
          <option value="STANDBY">Standby</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Voyage</th>
                <th>Client</th>
                <th>Shipper</th>
                <th>Consignee</th>
                <th>Cargo</th>
                <th>Requested</th>
                <th>Confirmed</th>
                <th>Standby</th>
                <th>Route</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.cellMuted} style={{ textAlign: 'center', padding: '2rem' }}>
                    No bookings match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr
                    key={b._id}
                    className={b.status === 'PENDING' || b.status === 'STANDBY' ? styles.rowHighlight : ''}
                  >
                    <td className={styles.cellMono}>
                      <div className={styles.bookingCell}>
                        {b.bookingNumber}
                        <EstimateSourceBadge source={b.estimateSource} />
                      </div>
                    </td>
                    <td className={styles.cellMuted}>{b.voyageNumber}</td>
                    <td>{b.clientName}</td>
                    <td className={styles.cellMuted}>{b.shipperName}</td>
                    <td className={styles.cellMuted}>{b.consigneeName}</td>
                    <td>
                      <div className={styles.cargoCell}>
                        <span
                          className={styles.cargoDot}
                          style={{ background: cargoColors[b.cargoType] || 'var(--color-text-muted)' }}
                        />
                        {formatCargo(b.cargoType)}
                      </div>
                    </td>
                    <td className={styles.cellRight}>{b.requestedQuantity}</td>
                    <td className={styles.cellRight}>
                      {b.confirmedQuantity > 0 ? (
                        <span className={styles.cellConfirmed}>{b.confirmedQuantity}</span>
                      ) : (
                        <span className={styles.cellZero}>—</span>
                      )}
                    </td>
                    <td className={styles.cellRight}>
                      {b.standbyQuantity > 0 ? (
                        <span className={styles.cellStandby}>{b.standbyQuantity}</span>
                      ) : (
                        <span className={styles.cellZero}>—</span>
                      )}
                    </td>
                    <td className={styles.cellRoute}>
                      <span>{b.polCode}</span>
                      <span className={styles.routeArrow}>→</span>
                      <span>{b.podCode}</span>
                    </td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      {b.status === 'PENDING' && (
                        <div className={styles.actionBtns}>
                          <button
                            className={styles.btnApprove}
                            onClick={() => setApproveTarget(b)}
                          >
                            Approve
                          </button>
                          <button
                            className={styles.btnReject}
                            onClick={() => setRejectTarget(b)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateBookingModal
          contracts={contracts}
          voyages={voyages}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {approveTarget && (
        <ApproveModal
          booking={approveTarget}
          onClose={() => setApproveTarget(null)}
        />
      )}
      {rejectTarget && (
        <RejectModal
          booking={rejectTarget}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Create Booking Modal (3-step)
// ---------------------------------------------------------------------------

function CreateBookingModal({
  contracts,
  voyages,
  onClose,
}: {
  contracts: ContractOption[];
  voyages: VoyageOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  // Step 1
  const [selectedContractId, setSelectedContractId] = useState('');
  // Step 2
  const [selectedVoyageId, setSelectedVoyageId] = useState('');
  // Step 3
  const [bookingRows, setBookingRows] = useState<BookingRow[]>([]);

  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const selectedVoyage = voyages.find((v) => v.id === selectedVoyageId);

  // Filter voyages by contract's service
  const matchingVoyages = useMemo(() => {
    if (!selectedContract) return [];
    return voyages.filter(
      (v) => v.serviceId === selectedContract.serviceId && v.status !== 'CANCELLED'
    );
  }, [voyages, selectedContract]);

  function goToStep2() {
    if (!selectedContract) return;
    setSelectedVoyageId('');
    setStep(2);
    setError('');
  }

  function goToStep3() {
    if (!selectedContract || !selectedVoyageId) return;
    // Build rows from counterparties × cargoTypes
    const rows: BookingRow[] = [];
    if (selectedContract.clientType === 'CONSIGNEE') {
      // counterparties are shippers
      for (const shipper of selectedContract.shippers) {
        for (const cargoType of shipper.cargoTypes) {
          rows.push({
            counterpartyName: shipper.name,
            counterpartyCode: shipper.code,
            shipperCode: shipper.code,
            consigneeCode: selectedContract.clientName, // client is consignee
            cargoType,
            weeklyEstimate: shipper.weeklyEstimate,
            requestedQuantity: shipper.weeklyEstimate,
            estimateSource: 'CONTRACT_DEFAULT',
          });
        }
      }
    } else {
      // client is SHIPPER, counterparties are consignees
      for (const consignee of selectedContract.consignees) {
        for (const cargoType of consignee.cargoTypes) {
          rows.push({
            counterpartyName: consignee.name,
            counterpartyCode: consignee.code,
            shipperCode: selectedContract.clientName, // client is shipper
            consigneeCode: consignee.code,
            cargoType,
            weeklyEstimate: consignee.weeklyEstimate,
            requestedQuantity: consignee.weeklyEstimate,
            estimateSource: 'CONTRACT_DEFAULT',
          });
        }
      }
    }
    setBookingRows(rows);
    setStep(3);
    setError('');
  }

  function updateRow(index: number, field: keyof BookingRow, value: any) {
    setBookingRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function handleSubmit() {
    if (!selectedContract || !selectedVoyageId) return;
    setError('');

    // Determine actual shipper/consignee codes
    const requests = bookingRows
      .filter((r) => r.requestedQuantity > 0)
      .map((row) => {
        let shipperCode: string;
        let consigneeCode: string;
        if (selectedContract.clientType === 'CONSIGNEE') {
          shipperCode = row.counterpartyCode;
          consigneeCode = row.counterpartyCode; // server resolves from contract client
        } else {
          shipperCode = row.counterpartyCode; // server resolves from contract client
          consigneeCode = row.counterpartyCode;
        }
        return {
          contractId: selectedContract.id,
          voyageId: selectedVoyageId,
          shipperCode,
          consigneeCode,
          cargoType: row.cargoType,
          requestedQuantity: row.requestedQuantity,
          estimateSource: row.estimateSource,
        };
      });

    if (requests.length === 0) {
      setError('At least one row must have a quantity greater than 0');
      return;
    }

    startTransition(async () => {
      try {
        const results = await Promise.all(
          requests.map((req) => createBookingFromContract(req))
        );
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          setError(failed.map((f) => f.error).join('; '));
          return;
        }
        router.refresh();
        onClose();
      } catch (e: any) {
        setError(e.message || 'Failed to create bookings');
      }
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>New Booking</h2>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <span className={step >= 1 ? styles.stepActive : styles.stepInactive}>1. Contract</span>
          <span className={styles.stepDivider}>→</span>
          <span className={step >= 2 ? styles.stepActive : styles.stepInactive}>2. Voyage</span>
          <span className={styles.stepDivider}>→</span>
          <span className={step >= 3 ? styles.stepActive : styles.stepInactive}>3. Quantities</span>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        {/* Step 1: Select Contract */}
        {step === 1 && (
          <div className={styles.modalBody}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Contract</label>
              <select
                className={styles.formSelect}
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
              >
                <option value="">Select a contract...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNumber} — {c.clientName} ({c.clientType})
                  </option>
                ))}
              </select>
            </div>
            {selectedContract && (
              <div className={styles.contractInfo}>
                <span>Service: {selectedContract.serviceCode}</span>
                <span>Office: {selectedContract.officeCode}</span>
                <span>Route: {selectedContract.originPort.portCode} → {selectedContract.destinationPort.portCode}</span>
                <span>
                  {selectedContract.clientType === 'CONSIGNEE'
                    ? `${selectedContract.shippers.length} shipper(s)`
                    : `${selectedContract.consignees.length} consignee(s)`}
                </span>
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={onClose}>Cancel</button>
              <button
                className={styles.btnPrimary}
                disabled={!selectedContractId}
                onClick={goToStep2}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Voyage */}
        {step === 2 && (
          <div className={styles.modalBody}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Voyage (service: {selectedContract?.serviceCode})
              </label>
              {matchingVoyages.length === 0 ? (
                <p className={styles.noVoyagesMsg}>
                  No voyages found for service {selectedContract?.serviceCode}.
                </p>
              ) : (
                <select
                  className={styles.formSelect}
                  value={selectedVoyageId}
                  onChange={(e) => setSelectedVoyageId(e.target.value)}
                >
                  <option value="">Select a voyage...</option>
                  {matchingVoyages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.voyageNumber} — {v.vesselName} ({new Date(v.departureDate).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setStep(1)}>Back</button>
              <button
                className={styles.btnPrimary}
                disabled={!selectedVoyageId}
                onClick={goToStep3}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Counterparty rows */}
        {step === 3 && (
          <div className={styles.modalBody}>
            <div className={styles.modalScroll}>
              <p className={styles.formLabel} style={{ marginBottom: '8px' }}>
                {selectedContract?.clientType === 'CONSIGNEE' ? 'Shippers' : 'Consignees'}
                {' '}— {selectedContract?.contractNumber} → {selectedVoyage?.voyageNumber}
              </p>
              {bookingRows.length === 0 ? (
                <p className={styles.noVoyagesMsg}>No counterparties found on this contract.</p>
              ) : (
                bookingRows.map((row, i) => (
                  <div key={`${row.counterpartyCode}-${row.cargoType}-${i}`} className={styles.counterpartyRow}>
                    <div className={styles.counterpartyHeader}>
                      <span className={styles.counterpartyName}>{row.counterpartyName}</span>
                      <span className={styles.counterpartyCode}>{row.counterpartyCode}</span>
                      <span className={styles.cargoBadge}>{formatCargo(row.cargoType)}</span>
                    </div>
                    <div className={styles.counterpartyFields}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Weekly Est.</label>
                        <span className={styles.estimateValue}>{row.weeklyEstimate}</span>
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Requested Qty</label>
                        <input
                          type="number"
                          className={styles.formInput}
                          min={0}
                          max={10000}
                          value={row.requestedQuantity}
                          onChange={(e) => updateRow(i, 'requestedQuantity', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Source</label>
                        <div className={styles.toggleGroup}>
                          <button
                            type="button"
                            className={`${styles.toggleBtn} ${row.estimateSource === 'CONTRACT_DEFAULT' ? styles['toggleBtn--active'] : ''}`}
                            onClick={() => updateRow(i, 'estimateSource', 'CONTRACT_DEFAULT')}
                          >
                            Contract
                          </button>
                          <button
                            type="button"
                            className={`${styles.toggleBtn} ${row.estimateSource === 'SHIPPER_CONFIRMED' ? styles['toggleBtn--active'] : ''}`}
                            onClick={() => updateRow(i, 'estimateSource', 'SHIPPER_CONFIRMED')}
                          >
                            Shipper
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setStep(2)}>Back</button>
              <button
                className={styles.btnPrimary}
                disabled={isPending || bookingRows.length === 0}
                onClick={handleSubmit}
              >
                {isPending ? 'Creating...' : `Create ${bookingRows.filter((r) => r.requestedQuantity > 0).length} Booking(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approve Modal
// ---------------------------------------------------------------------------

function ApproveModal({
  booking,
  onClose,
}: {
  booking: DisplayBooking;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmedQty, setConfirmedQty] = useState(booking.requestedQuantity);
  const [error, setError] = useState('');

  const standby = Math.max(0, booking.requestedQuantity - confirmedQty);
  const resultStatus = confirmedQty === 0 ? 'STANDBY' : confirmedQty < booking.requestedQuantity ? 'PARTIAL' : 'CONFIRMED';

  function handleApprove() {
    setError('');
    startTransition(async () => {
      try {
        const result = await approveBooking({
          bookingId: booking._id,
          confirmedQuantity: confirmedQty,
          approvedBy: 'system',
        });
        if (!result.success) {
          setError(result.error || 'Failed to approve');
          return;
        }
        router.refresh();
        onClose();
      } catch (e: any) {
        setError(e.message || 'Failed to approve booking');
      }
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Approve Booking</h2>
        <div className={styles.approveInfo}>
          <span className={styles.cellMono}>{booking.bookingNumber}</span>
          <span>{booking.clientName} · {formatCargo(booking.cargoType)}</span>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              Confirmed Quantity (max: {booking.requestedQuantity})
            </label>
            <input
              type="number"
              className={styles.formInput}
              min={0}
              max={booking.requestedQuantity}
              value={confirmedQty}
              onChange={(e) => setConfirmedQty(Math.min(parseInt(e.target.value) || 0, booking.requestedQuantity))}
            />
          </div>
          <div className={styles.approvePreview}>
            <div className={styles.previewItem}>
              <span className={styles.fieldLabel}>Requested</span>
              <span>{booking.requestedQuantity}</span>
            </div>
            <div className={styles.previewItem}>
              <span className={styles.fieldLabel}>Confirmed</span>
              <span className={styles.cellConfirmed}>{confirmedQty}</span>
            </div>
            <div className={styles.previewItem}>
              <span className={styles.fieldLabel}>Standby</span>
              <span className={standby > 0 ? styles.cellStandby : styles.cellZero}>
                {standby > 0 ? standby : '—'}
              </span>
            </div>
            <div className={styles.previewItem}>
              <span className={styles.fieldLabel}>Result</span>
              <StatusBadge status={resultStatus} />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button className={styles.btnModalCancel} onClick={onClose}>Cancel</button>
            <button
              className={styles.btnApproveAction}
              disabled={isPending}
              onClick={handleApprove}
            >
              {isPending ? 'Approving...' : 'Confirm Approval'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reject Modal
// ---------------------------------------------------------------------------

function RejectModal({
  booking,
  onClose,
}: {
  booking: DisplayBooking;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleReject() {
    if (!reason.trim()) {
      setError('Rejection reason is required');
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        const result = await rejectBooking({
          bookingId: booking._id,
          rejectionReason: reason.trim(),
          rejectedBy: 'system',
        });
        if (!result.success) {
          setError(result.error || 'Failed to reject');
          return;
        }
        router.refresh();
        onClose();
      } catch (e: any) {
        setError(e.message || 'Failed to reject booking');
      }
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Reject Booking</h2>
        <div className={styles.approveInfo}>
          <span className={styles.cellMono}>{booking.bookingNumber}</span>
          <span>{booking.clientName} · {formatCargo(booking.cargoType)}</span>
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Rejection Reason</label>
            <textarea
              className={styles.formTextarea}
              rows={3}
              placeholder="Provide a reason for rejection..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnModalCancel} onClick={onClose}>Cancel</button>
            <button
              className={styles.btnRejectAction}
              disabled={isPending || !reason.trim()}
              onClick={handleReject}
            >
              {isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
