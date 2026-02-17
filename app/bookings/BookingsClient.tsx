'use client';

import { useState, useMemo } from 'react';
import styles from './page.module.css';
import type { CargoType } from '@/types/models';

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

function formatCargo(type: CargoType): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: any) => c.toUpperCase());
}

export interface DisplayBooking {
  _id: string;
  bookingNumber: string;
  voyageNumber: string;
  clientName: string;
  consigneeName: string;
  cargoType: CargoType;
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity: number;
  polCode: string;
  podCode: string;
  status: string;
}

interface BookingsClientProps {
  bookings: DisplayBooking[];
  voyageNumbers: string[];
}

export default function BookingsClient({ bookings, voyageNumbers }: BookingsClientProps) {
  const [searchText, setSearchText] = useState('');
  const [filterVoyage, setFilterVoyage] = useState('');
  const [filterCargo, setFilterCargo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filtered = useMemo(() => {
    return bookings.filter((b: any) => {
      if (filterStatus && b.status !== filterStatus) return false;
      if (filterCargo && b.cargoType !== filterCargo) return false;
      if (filterVoyage && b.voyageNumber !== filterVoyage) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const match =
          b.bookingNumber.toLowerCase().includes(q) ||
          b.clientName.toLowerCase().includes(q) ||
          b.consigneeName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bookings, filterStatus, filterCargo, filterVoyage, searchText]);

  // Derive unique cargo types from data
  const cargoTypes = useMemo(() => {
    return [...new Set(bookings.map((b: any) => b.cargoType))].sort();
  }, [bookings]);

  return (
    <>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search by booking, client, consignee..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className={styles.select}
          value={filterVoyage}
          onChange={(e) => setFilterVoyage(e.target.value)}
        >
          <option value="">All Voyages</option>
          {voyageNumbers.map((v: any) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterCargo}
          onChange={(e) => setFilterCargo(e.target.value)}
        >
          <option value="">All Cargo</option>
          {cargoTypes.map((ct: any) => (
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
                <th>Consignee</th>
                <th>Cargo</th>
                <th>Requested</th>
                <th>Confirmed</th>
                <th>Standby</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.cellMuted} style={{ textAlign: 'center', padding: '2rem' }}>
                    No bookings match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((b: any) => (
                  <tr
                    key={b._id}
                    className={b.status === 'PENDING' || b.status === 'STANDBY' ? styles.rowHighlight : ''}
                  >
                    <td className={styles.cellMono}>{b.bookingNumber}</td>
                    <td className={styles.cellMuted}>{b.voyageNumber}</td>
                    <td>{b.clientName}</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
