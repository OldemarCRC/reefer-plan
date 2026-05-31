'use client';

import { useState } from 'react';
import styles from './UnassignedCargoPanel.module.css';
import { getPodColor } from '@/lib/constants/pod-colors';

export interface UnassignedBooking {
  bookingId: string;
  bookingNumber: string;
  cargoType: string;
  cargoShortLabel?: string;
  totalQuantity: number;
  assignedQuantity: number;
  pol: string;
  pod: string;
  shipperName: string;
  consignee: string;
  isConfirmed: boolean;
  temperature?: number;
}

interface Props {
  bookings: UnassignedBooking[];
  targetCompartment?: {
    sectionId: string;
    holdNumber: number;
    level: string;
    cargoShortLabel?: string;
    palletsLoaded: number;
    palletsCapacity: number;
    setTemperature?: number;
  } | null;
  onAssign: (booking: UnassignedBooking, quantity: number) => void;
  onClose: () => void;
  isNarrow?: boolean;
}

export default function UnassignedCargoPanel({
  bookings, targetCompartment, onAssign, onClose, isNarrow,
}: Props) {
  const [filter, setFilter] = useState<'ALL' | 'UNASSIGNED' | 'PARTIAL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [assignQty, setAssignQty] = useState(0);
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => onClose(), 180);
  };

  const availableInTarget = targetCompartment
    ? targetCompartment.palletsCapacity - targetCompartment.palletsLoaded
    : 999;

  const filtered = bookings.filter(b => {
    const remaining = b.totalQuantity - b.assignedQuantity;
    if (filter === 'UNASSIGNED' && b.assignedQuantity > 0) return false;
    if (filter === 'PARTIAL' && (b.assignedQuantity === 0 || remaining <= 0)) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !b.bookingNumber.toLowerCase().includes(q) &&
        !b.shipperName.toLowerCase().includes(q) &&
        !b.consignee.toLowerCase().includes(q) &&
        !b.pod.toLowerCase().includes(q) &&
        !b.pol.toLowerCase().includes(q)
      ) return false;
    }
    return remaining > 0;
  });

  const selectedBooking = bookings.find(b => b.bookingId === selectedBookingId);
  const maxAssignable = selectedBooking
    ? Math.min(
        selectedBooking.totalQuantity - selectedBooking.assignedQuantity,
        availableInTarget,
      )
    : 0;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={`${styles.panel} ${isNarrow ? styles.panelNarrow : ''} ${closing ? styles.panelClosing : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <h3 className={styles.title}>Unassigned Cargo</h3>
            <button className={styles.closeBtn} onClick={handleClose}>✕</button>
          </div>
          {targetCompartment && (
            <div className={styles.targetBadge}>
              Assigning to: Hold {targetCompartment.holdNumber}-{targetCompartment.level}
              <span className={styles.targetSpace}>
                {availableInTarget} pallets free
              </span>
            </div>
          )}
          <input
            className={styles.searchInput}
            placeholder="Search booking, shipper, consignee, port…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <div className={styles.filterTabs}>
            {(['ALL', 'UNASSIGNED', 'PARTIAL'] as const).map(f => (
              <button
                key={f}
                className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? 'All' : f === 'UNASSIGNED' ? 'Not placed' : 'Partial'}
              </button>
            ))}
          </div>
        </div>

        {/* Booking list */}
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No bookings with remaining pallets.</div>
          )}
          {filtered.map(b => {
            const remaining = b.totalQuantity - b.assignedQuantity;
            const pct = b.totalQuantity > 0
              ? Math.round((b.assignedQuantity / b.totalQuantity) * 100) : 0;
            const isSelected = b.bookingId === selectedBookingId;
            const podColor = getPodColor(b.pod);

            return (
              <div
                key={b.bookingId}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${!b.isConfirmed ? styles.cardEstimate : ''}`}
                onClick={() => {
                  const nowSelected = !isSelected;
                  setSelectedBookingId(nowSelected ? b.bookingId : null);
                  if (nowSelected) {
                    setAssignQty(Math.min(remaining, availableInTarget));
                  }
                }}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.podDot} style={{ background: podColor }} />
                  <span className={styles.bookingNum}>{b.bookingNumber}</span>
                  {!b.isConfirmed && (
                    <span className={styles.estimateBadge}>Est</span>
                  )}
                  <span className={styles.remainingBadge}>{remaining} plt left</span>
                </div>
                <div className={styles.cardMeta}>
                  <span>{b.cargoShortLabel ?? b.cargoType}</span>
                  <span className={styles.dot}>·</span>
                  <span>{b.shipperName}</span>
                  <span className={styles.dot}>·</span>
                  <span>{b.pol} → {b.pod}</span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${pct}%`, background: podColor }}
                  />
                </div>

                {isSelected && targetCompartment && (
                  <div className={styles.assignPanel}>
                    <div className={styles.assignRow}>
                      <label className={styles.assignLabel}>Pallets to assign:</label>
                      <input
                        type="number"
                        className={styles.assignInput}
                        min={1}
                        max={maxAssignable}
                        value={assignQty}
                        onChange={e => setAssignQty(
                          Math.min(maxAssignable, Math.max(1, parseInt(e.target.value) || 0))
                        )}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={maxAssignable}
                      value={assignQty}
                      onChange={e => setAssignQty(parseInt(e.target.value))}
                      onClick={e => e.stopPropagation()}
                      className={styles.slider}
                    />
                    <div className={styles.assignMeta}>
                      Max assignable to this compartment: {maxAssignable} pallets
                    </div>
                    <button
                      className={styles.assignBtn}
                      disabled={assignQty <= 0 || assignQty > maxAssignable}
                      onClick={e => {
                        e.stopPropagation();
                        onAssign(b, assignQty);
                      }}
                    >
                      Assign {assignQty} pallets → Hold {targetCompartment.holdNumber}-{targetCompartment.level}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
