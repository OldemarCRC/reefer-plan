'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSpaceForecast } from '@/app/actions/space-forecast';
import styles from './ForecastWizard.module.css';

interface ServiceInfo {
  _id: string;
  serviceCode?: string;
  serviceName?: string;
}

interface Contract {
  _id: string;
  contractNumber: string;
  cargoType?: string;
  weeklyPallets?: number;
  serviceId: ServiceInfo | string | null;
  originPort?: { portCode: string; portName: string };
  destinationPort?: { portCode: string; portName: string };
}

interface PortCall {
  portCode: string;
  portName: string;
  operations: string[];
  eta?: string | null;
  ata?: string | null;
  atd?: string | null;
}

interface Voyage {
  _id: string;
  voyageNumber: string;
  vesselName: string;
  status: string;
  departureDate: string | null;
  portCalls: PortCall[];
}

interface ForecastWizardProps {
  contracts: Contract[];
  voyagesByServiceId: Record<string, Voyage[]>;
  existingForecasts: any[];
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getServiceId(contract: Contract): string {
  if (!contract.serviceId) return '';
  if (typeof contract.serviceId === 'string') return contract.serviceId;
  return (contract.serviceId as ServiceInfo)._id ?? '';
}

function getServiceCode(contract: Contract): string {
  if (!contract.serviceId || typeof contract.serviceId === 'string') return '';
  return (contract.serviceId as ServiceInfo).serviceCode ?? '';
}

export default function ForecastWizard({
  contracts,
  voyagesByServiceId,
  existingForecasts,
}: ForecastWizardProps) {
  const router = useRouter();
  const [step, setStep]               = useState<1 | 2>(1);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [estimates, setEstimates]     = useState<Record<string, string>>({});
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);

  const selectedContract = contracts.find(c => c._id === selectedId) ?? null;
  const serviceId        = selectedContract ? getServiceId(selectedContract) : '';
  const voyages          = serviceId ? (voyagesByServiceId[serviceId] ?? []) : [];

  const getExistingForecast = (voyageId: string) =>
    existingForecasts.find((f: any) =>
      f.voyageId?.toString() === voyageId &&
      f.contractId?.toString() === selectedId
    ) ?? null;

  const isBookingConfirmed = (voyageId: string) => {
    const f = getExistingForecast(voyageId);
    return f?.planImpact === 'REPLACED_BY_BOOKING';
  };

  const hasAnyInput = Object.values(estimates).some(v => v && parseInt(v, 10) > 0);

  const handleEstimateChange = (voyageId: string, value: string) => {
    setEstimates(prev => ({ ...prev, [voyageId]: value }));
  };

  const handleNext = () => {
    if (!selectedId) return;
    setEstimates({});
    setError(null);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    const entries = Object.entries(estimates).filter(([, v]) => v && parseInt(v, 10) > 0);
    if (entries.length === 0) {
      setError('Please enter at least one estimate before submitting.');
      return;
    }
    startTransition(async () => {
      let successCount = 0;
      for (const [voyageId, value] of entries) {
        const result = await createSpaceForecast({
          contractId:       selectedId!,
          voyageId,
          estimatedPallets: parseInt(value, 10),
          source:           'SHIPPER_PORTAL',
        });
        if (!result.success) {
          setError((result as any).error ?? 'Failed to submit estimate. Please try again.');
          return;
        }
        successCount++;
      }
      router.push(`/shipper/forecasts?submitted=${successCount}`);
    });
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New Forecast</h1>
      </div>

      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        <div className={`${styles.stepDot} ${step >= 1 ? styles['stepDot--active'] : ''}`}>1</div>
        <span className={`${styles.stepLabel} ${step === 1 ? styles['stepLabel--active'] : ''}`}>
          Select Contract
        </span>
        <div className={styles.stepSep} />
        <div className={`${styles.stepDot} ${step === 2 ? styles['stepDot--active'] : ''}`}>2</div>
        <span className={`${styles.stepLabel} ${step === 2 ? styles['stepLabel--active'] : ''}`}>
          Enter Estimates
        </span>
      </div>

      {/* Step 1 — Contract selection */}
      {step === 1 && (
        <>
          {contracts.length === 0 ? (
            <div className={styles.noContracts}>
              No active contracts found for your account. Contact your shipping agent.
            </div>
          ) : (
            <div className={styles.contractGrid}>
              {contracts.map(c => {
                const isSelected = c._id === selectedId;
                const svcCode    = getServiceCode(c);
                const route = (c.originPort?.portCode && c.destinationPort?.portCode)
                  ? `${c.originPort.portCode} → ${c.destinationPort.portCode}`
                  : svcCode || '—';
                return (
                  <div
                    key={c._id}
                    className={`${styles.contractCard} ${isSelected ? styles['contractCard--selected'] : ''}`}
                    onClick={() => setSelectedId(c._id)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setSelectedId(c._id); }}
                  >
                    <div className={styles.contractRadio}>
                      {isSelected && <div className={styles.contractRadioDot} />}
                    </div>
                    <div className={styles.contractInfo}>
                      <div className={styles.contractNumber}>{c.contractNumber}</div>
                      <div className={styles.contractTitle}>
                        {c.cargoType ? c.cargoType.replace(/_/g, ' ') : 'Cargo'}
                      </div>
                      <div className={styles.contractMeta}>{route}</div>
                    </div>
                    {(c.weeklyPallets ?? 0) > 0 && (
                      <div className={styles.contractWeekly}>
                        ~{c.weeklyPallets} plt/week
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.footer}>
            <button
              className={styles.btnPrimary}
              onClick={handleNext}
              disabled={!selectedId || contracts.length === 0}
            >
              Next →
            </button>
            <Link href="/shipper/forecasts" className={styles.btnSecondary}>
              Cancel
            </Link>
          </div>
        </>
      )}

      {/* Step 2 — Enter estimates per voyage */}
      {step === 2 && selectedContract && (
        <>
          {voyages.length === 0 ? (
            <div className={styles.emptyState}>
              No upcoming voyages found for this contract&apos;s service.
            </div>
          ) : (
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Voyage #</th>
                    <th>Vessel</th>
                    <th>Departure</th>
                    <th>Route</th>
                    <th>Your Estimate (plt)</th>
                  </tr>
                </thead>
                <tbody>
                  {voyages.map((v: Voyage) => {
                    const existing      = getExistingForecast(v._id);
                    const bookingLocked = isBookingConfirmed(v._id);
                    const currentVal    = estimates[v._id] ?? '';
                    const prefilled     = existing?.estimatedPallets ?? null;
                    const isUpdated     = currentVal && prefilled && parseInt(currentVal, 10) !== prefilled;

                    const loadPorts    = v.portCalls
                      .filter((pc: PortCall) => pc.operations?.includes('LOAD'))
                      .sort((a: PortCall, b: PortCall) => 0)
                      .map((pc: PortCall) => pc.portCode)
                      .join(', ');
                    const dischPorts   = v.portCalls
                      .filter((pc: PortCall) => pc.operations?.includes('DISCHARGE'))
                      .map((pc: PortCall) => pc.portCode)
                      .join(', ');
                    const route = loadPorts && dischPorts
                      ? `${loadPorts} → ${dischPorts}`
                      : loadPorts || dischPorts || '—';

                    return (
                      <tr key={v._id}>
                        <td className={styles.mono}>{v.voyageNumber}</td>
                        <td style={{ fontWeight: 'var(--weight-medium)' as any }}>{v.vesselName}</td>
                        <td className={styles.mono}>{fmtDate(v.departureDate)}</td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{route}</td>
                        <td>
                          {bookingLocked ? (
                            <span className={`${styles.badge} ${styles.badgeBooking}`}>
                              Booking confirmed
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="number"
                                min={1}
                                max={9999}
                                className={styles.estimateInput}
                                placeholder={prefilled ? String(prefilled) : '—'}
                                value={currentVal}
                                onChange={e => handleEstimateChange(v._id, e.target.value)}
                                disabled={isPending}
                              />
                              {isUpdated && (
                                <span className={`${styles.badge} ${styles.badgeUpdated}`}>
                                  UPDATED
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.footer}>
            <button
              className={styles.btnPrimary}
              onClick={handleSubmit}
              disabled={isPending || !hasAnyInput || voyages.length === 0}
            >
              {isPending ? 'Submitting…' : 'Submit Estimates'}
            </button>
            <button className={styles.btnSecondary} onClick={handleBack} disabled={isPending}>
              ← Back
            </button>
            <Link href="/shipper/forecasts" className={styles.btnSecondary}>
              Cancel
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
