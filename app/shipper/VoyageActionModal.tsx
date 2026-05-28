'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getVoyageSubmissionStatus } from '@/app/actions/shipper';
import styles from './shipper.module.css';

export interface VoyagePortCall {
  portCode: string;
  portName?: string;
  country?: string;
  sequence: number;
  operations?: string[];
  eta?: string | null;
  etd?: string | null;
}

export interface VoyageInfo {
  _id: string;
  voyageNumber: string;
  vesselName: string;
  status?: string;
  departureDate: string | null;
  portCalls: VoyagePortCall[];
}

interface ContractStatus {
  contractId: string;
  contractNumber: string;
  cargoType: string;
  weeklyEstimate: number;
  status: 'NONE' | 'HAS_ESTIMATE' | 'HAS_BOOKING';
}

interface Props {
  voyage: VoyageInfo;
  onClose: () => void;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VoyageActionModal({ voyage, onClose }: Props) {
  const [contracts, setContracts] = useState<ContractStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...voyage.portCalls].sort((a, b) => a.sequence - b.sequence);
  const loadPorts = sorted.filter(pc => pc.operations?.includes('LOAD') || (!sorted.some(p => p.operations?.includes('LOAD')) && pc.sequence <= 2));
  const dischPorts = sorted.filter(pc => pc.operations?.includes('DISCHARGE'));

  const routeLabel = loadPorts.length > 0
    ? `${loadPorts.map(p => p.portCode).join(', ')} → ${dischPorts.map(p => p.portCode).join(', ')}`
    : sorted.map(p => p.portCode).join(' → ');

  useEffect(() => {
    setLoading(true);
    setError(null);
    getVoyageSubmissionStatus(voyage._id).then(res => {
      if (res.success && res.data) {
        setContracts(res.data.contracts);
      } else {
        setError(res.error ?? 'Failed to load');
      }
      setLoading(false);
    });
  }, [voyage._id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.voyageModal} role="dialog" aria-modal="true">
        <div className={styles.voyageModalHeader}>
          <div>
            <div className={styles.voyageModalTitle}>{voyage.voyageNumber}</div>
            <div className={styles.voyageModalSub}>
              {voyage.vesselName} · Dep. {fmtDate(voyage.departureDate)} · {routeLabel}
            </div>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.voyageModalBody}>
          {loading && (
            <div className={styles.voyageModalLoading}>Loading…</div>
          )}
          {!loading && error && (
            <div className={styles.voyageModalLoading}>{error}</div>
          )}
          {!loading && !error && contracts.length === 0 && (
            <div className={styles.voyageModalEmpty}>No active contracts found for this voyage.</div>
          )}
          {!loading && !error && contracts.map(c => (
            <div key={c.contractId} className={styles.contractRow}>
              <div className={styles.contractRowInfo}>
                <span className={styles.contractRowNum}>{c.contractNumber}</span>
                <span className={styles.contractRowCargo}>{c.cargoType.replace(/_/g, ' ')}</span>
                <span className={styles.contractRowEst}>{c.weeklyEstimate} plt/wk</span>
              </div>
              <div className={styles.contractRowActions}>
                {c.status === 'HAS_BOOKING' && (
                  <span className={styles.statusDone}>Booked</span>
                )}
                {c.status === 'HAS_ESTIMATE' && (
                  <>
                    <span className={styles.statusEstimate}>Estimate sent</span>
                    <Link
                      href={`/shipper/request`}
                      className={styles.btnActionSm}
                    >
                      Book →
                    </Link>
                  </>
                )}
                {c.status === 'NONE' && (
                  <>
                    <Link
                      href={`/shipper/forecasts/new?voyageId=${voyage._id}&contractId=${c.contractId}`}
                      className={styles.btnActionSmSecondary}
                    >
                      Submit Estimate
                    </Link>
                    <Link
                      href={`/shipper/request`}
                      className={styles.btnActionSm}
                    >
                      Request Booking
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
