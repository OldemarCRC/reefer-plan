'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const statusStyles: Record<string, { bg: string; color: string }> = {
  IN_PROGRESS: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  PLANNED: { bg: 'var(--color-blue-muted)', color: 'var(--color-blue-light)' },
  ESTIMATED: { bg: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  CONFIRMED: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  COMPLETED: { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' },
  CANCELLED: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: style.bg, color: style.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function UtilizationBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const barColor = pct >= 90 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-cyan)';
  return (
    <div className={styles.utilBar}>
      <div className={styles.utilTrack}>
        <div className={styles.utilFill} style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className={styles.utilPct}>{pct}%</span>
      <span className={styles.utilDetail}>{used.toLocaleString()}/{total.toLocaleString()}</span>
    </div>
  );
}

export interface DisplayPortCall {
  portCode: string;
  portName: string;
  country: string;
  sequence: number;
  eta: string | null;
  etd: string | null;
  operations: string[];
  locked: boolean;
  weather: number | null;
  isForecastTemp?: boolean;
}

export interface DisplayVoyage {
  _id: string;
  voyageNumber: string;
  weekNumber?: number;
  status: string;
  vesselName: string;
  vesselImoNumber: string | null;
  serviceCode: string;
  startDate: string;
  portCalls: DisplayPortCall[];
  bookingsCount: number;
  palletsBooked: number;
  palletsCapacity: number;
}

interface VoyagesClientProps {
  voyages: DisplayVoyage[];
}

export default function VoyagesClient({ voyages }: VoyagesClientProps) {
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVessel, setFilterVessel] = useState('');
  const [filterService, setFilterService] = useState('');

  const filtered = useMemo(() => {
    return voyages.filter((v) => {
      if (filterStatus && v.status !== filterStatus) return false;
      if (filterVessel && v.vesselName !== filterVessel) return false;
      if (filterService && v.serviceCode !== filterService) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const match =
          v.voyageNumber.toLowerCase().includes(q) ||
          v.vesselName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [voyages, filterStatus, filterVessel, filterService, searchText]);

  const vesselNames = useMemo(() => {
    return [...new Set(voyages.map((v) => v.vesselName))].sort();
  }, [voyages]);

  const serviceCodes = useMemo(() => {
    return [...new Set(voyages.map((v) => v.serviceCode).filter((s) => s !== 'N/A'))].sort();
  }, [voyages]);

  return (
    <>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search voyages..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className={styles.select}
          value={filterVessel}
          onChange={(e) => setFilterVessel(e.target.value)}
        >
          <option value="">All Vessels</option>
          {vesselNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
        >
          <option value="">All Services</option>
          {serviceCodes.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="PLANNED">Planned</option>
          <option value="ESTIMATED">Estimated</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Voyage cards */}
      <div className={styles.voyageList}>
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
            No voyages match the current filters.
          </p>
        ) : (
          filtered.map((v) => (
            <div key={v._id} className={styles.voyageCard}>
              {/* Card header */}
              <div className={styles.voyageHeader}>
                <div className={styles.voyageId}>
                  <span className={styles.voyageCode}>{v.voyageNumber}</span>
                  {v.weekNumber != null && (
                    <span className={styles.weekBadge}>WK{String(v.weekNumber).padStart(2, '0')}</span>
                  )}
                  <StatusBadge status={v.status} />
                </div>
                <div className={styles.voyageMeta}>
                  <span className={styles.vesselNameWrap}>
                    {v.vesselName}
                    {v.vesselImoNumber && (
                      <a
                        href={`https://www.marinetraffic.com/en/ais/details/ships/imo:${v.vesselImoNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.mtLink}
                        title={`Track ${v.vesselName} on MarineTraffic (IMO ${v.vesselImoNumber})`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 1h4v4" />
                          <path d="M11 1L5.5 6.5" />
                          <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" />
                        </svg>
                      </a>
                    )}
                  </span>
                  <span className={styles.dot}>·</span>
                  <span className={styles.muted}>{v.serviceCode}</span>
                  <span className={styles.dot}>·</span>
                  <span className={styles.muted}>{v.startDate}</span>
                </div>
              </div>

              {/* Port call timeline */}
              <div className={styles.timeline}>
                {v.portCalls.map((pc, i, sorted) => {
                  const isLoad = pc.operations.includes('LOAD');
                  return (
                    <div key={i} className={styles.timelineStop}>
                      <div className={styles.timelineDot} data-type={isLoad ? 'load' : 'discharge'}>
                        {pc.locked && (
                          <svg className={styles.lockIcon} viewBox="0 0 12 12" fill="currentColor">
                            <path d="M9 5V4a3 3 0 10-6 0v1H2v6h8V5H9zM4 4a2 2 0 114 0v1H4V4z" />
                          </svg>
                        )}
                      </div>
                      {i < sorted.length - 1 && <div className={styles.timelineLine} />}
                      <div className={styles.timelineInfo}>
                        <span className={styles.portCode}>
                          {pc.portCode}
                          {pc.weather !== null && (
                            <span className={styles.portTemp}>
                              {' '}{pc.weather}°C
                              {pc.isForecastTemp && (
                                <span className={styles.forecastBadge}>fcst</span>
                              )}
                            </span>
                          )}
                        </span>
                        <span className={styles.portName}>{pc.portName}</span>
                        {pc.eta && <span className={styles.portDate}>{pc.eta}</span>}
                        <span className={styles.portOp}>
                          {isLoad ? '▲ Load' : '▼ Discharge'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Card footer */}
              <div className={styles.voyageFooter}>
                <div className={styles.voyageStat}>
                  <span className={styles.voyageStatLabel}>Bookings</span>
                  <span className={styles.voyageStatValue}>{v.bookingsCount}</span>
                </div>
                <div className={styles.voyageUtilWrap}>
                  <span className={styles.voyageStatLabel}>Utilization</span>
                  <UtilizationBar used={v.palletsBooked} total={v.palletsCapacity} />
                </div>
                <Link href={`/voyages/${v._id}`} className={styles.btnGhost}>View Details →</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
