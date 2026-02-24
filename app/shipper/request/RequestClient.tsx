'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getUpcomingVoyagesForService } from '@/app/actions/shipper';
import { createBookingFromContract } from '@/app/actions/booking';
import styles from '../shipper.module.css';

const CARGO_TYPES = [
  'BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'FROZEN_FISH', 'TABLE_GRAPES',
  'CITRUS', 'AVOCADOS', 'BERRIES', 'KIWIS', 'PINEAPPLES', 'CHERRIES',
  'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS', 'PAPAYA',
  'MANGOES', 'OTHER_FROZEN', 'OTHER_CHILLED',
] as const;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function countryFlag(country: string) {
  if (!country || country.length !== 2) return '';
  return country.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

interface RequestClientProps {
  shipperCode: string;
  initialContracts: any[];
}

export default function RequestClient({ shipperCode, initialContracts }: RequestClientProps) {
  const router = useRouter();

  const [step, setStep] = useState(1); // 1, 2, 3

  // Step 1 state
  const [selectedContractId, setSelectedContractId] = useState('');

  // Step 2 state
  const [voyages, setVoyages] = useState<any[]>([]);
  const [voyagesLoading, setVoyagesLoading] = useState(false);
  const [selectedVoyageId, setSelectedVoyageId] = useState('');

  // Step 3 state
  const [cargoType, setCargoType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [temperature, setTemperature] = useState('');

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedContract = initialContracts.find(c => c._id === selectedContractId);
  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId);

  // Determine shipper code to pass to createBookingFromContract
  const resolvedShipperCode = (() => {
    if (!selectedContract) return '';
    if (selectedContract.client?.type === 'SHIPPER') {
      return selectedContract.client?.clientNumber ?? shipperCode;
    }
    // Find in shippers array
    const found = (selectedContract.shippers ?? []).find((s: any) => s.code === shipperCode);
    return found?.code ?? shipperCode;
  })();

  // Determine consignee code to pass
  const resolvedConsigneeCode = (() => {
    if (!selectedContract) return '';
    if (selectedContract.client?.type === 'CONSIGNEE') {
      return selectedContract.client?.clientNumber ?? '';
    }
    // Pick first consignee
    return selectedContract.consignees?.[0]?.code ?? '';
  })();

  // Weekly estimate hint from contract
  const weeklyHint = (() => {
    if (!selectedContract) return null;
    const shipper = (selectedContract.shippers ?? []).find((s: any) => s.code === shipperCode);
    return shipper?.weeklyEstimate ?? null;
  })();

  // Available cargo types from contract
  const contractCargoTypes = (() => {
    if (!selectedContract) return CARGO_TYPES;
    const shipper = (selectedContract.shippers ?? []).find((s: any) => s.code === shipperCode);
    return shipper?.cargoTypes?.length ? shipper.cargoTypes : CARGO_TYPES;
  })();

  // Step 1 → 2: load voyages for selected contract's service
  const handleStep1Next = async () => {
    if (!selectedContractId) return;
    setError(null);
    setVoyagesLoading(true);
    setVoyages([]);
    setSelectedVoyageId('');

    const serviceId = selectedContract?.serviceId?._id ?? selectedContract?.serviceId;
    if (!serviceId) {
      setError('Contract has no linked service.');
      setVoyagesLoading(false);
      return;
    }

    const result = await getUpcomingVoyagesForService(serviceId);
    setVoyagesLoading(false);
    if (!result.success || result.data.length === 0) {
      setError('No upcoming voyages found for this service.');
      return;
    }
    setVoyages(result.data);
    setStep(2);
  };

  // Step 2 → 3
  const handleStep2Next = () => {
    if (!selectedVoyageId) return;
    setError(null);
    // Pre-fill cargoType if contract only has one
    if (contractCargoTypes.length === 1) setCargoType(contractCargoTypes[0]);
    if (weeklyHint) setQuantity(String(weeklyHint));
    setStep(3);
  };

  // Step 3: Submit
  const handleSubmit = () => {
    setError(null);
    const qty = parseInt(quantity, 10);
    if (!cargoType) { setError('Please select a cargo type.'); return; }
    if (!qty || qty <= 0) { setError('Please enter a valid quantity.'); return; }

    startTransition(async () => {
      const result = await createBookingFromContract({
        contractId: selectedContractId,
        voyageId: selectedVoyageId,
        shipperCode: resolvedShipperCode,
        consigneeCode: resolvedConsigneeCode,
        cargoType,
        requestedQuantity: qty,
        requestedTemperature: temperature ? parseFloat(temperature) : undefined,
        estimateSource: 'SHIPPER_CONFIRMED',
      });

      if (result.success) {
        router.push('/shipper/bookings');
      } else {
        setError(result.error ?? 'Failed to submit booking request.');
      }
    });
  };

  if (!shipperCode) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>New Booking Request</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account has not been linked to a shipper code.
            Please contact your shipping coordinator.
          </p>
        </div>
      </div>
    );
  }

  if (initialContracts.length === 0) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>New Booking Request</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            No active contracts found for shipper code <strong>{shipperCode}</strong>.
            Please contact your shipping coordinator to set up a contract.
          </p>
        </div>
      </div>
    );
  }

  const stepLabel = (n: number) => {
    let cls = styles.wizardStep;
    if (n < step) cls += ` ${styles['wizardStep--done']}`;
    else if (n === step) cls += ` ${styles['wizardStep--active']}`;
    return cls;
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New Booking Request</h1>
        <p className={styles.pageSubtitle}>Submit a cargo space request in 3 steps.</p>
      </div>

      <div className={styles.wizard}>
        {/* Step indicator */}
        <div className={styles.wizardSteps}>
          {[
            { n: 1, label: 'Select Contract' },
            { n: 2, label: 'Pick Voyage' },
            { n: 3, label: 'Cargo Details' },
          ].map(({ n, label }) => (
            <div key={n} className={stepLabel(n)}>
              <div className={styles.wizardStepDot}>
                {n < step ? '✓' : n}
              </div>
              <div className={styles.wizardStepLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Step 1: Select Contract */}
        {step === 1 && (
          <div className={styles.wizardPanel}>
            <div className={styles.wizardTitle}>Select Contract</div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Active Contract</label>
              <select
                className={styles.formSelect}
                value={selectedContractId}
                onChange={e => setSelectedContractId(e.target.value)}
              >
                <option value="">— Select a contract —</option>
                {initialContracts.map((c: any) => (
                  <option key={c._id} value={c._id}>
                    {c.contractNumber} — {c.serviceCode} · {c.originPort?.portCode} → {c.destinationPort?.portCode}
                  </option>
                ))}
              </select>
            </div>

            {selectedContract && (
              <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <div><strong>Service:</strong> {selectedContract.serviceCode}</div>
                <div><strong>Route:</strong> {selectedContract.originPort?.portName} → {selectedContract.destinationPort?.portName}</div>
                <div><strong>Valid:</strong> {fmtDate(selectedContract.validFrom)} – {fmtDate(selectedContract.validTo)}</div>
              </div>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.wizardActions}>
              <button
                className={styles.btnPrimary}
                onClick={handleStep1Next}
                disabled={!selectedContractId || voyagesLoading}
              >
                {voyagesLoading ? 'Loading voyages…' : 'Next: Pick Voyage →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Pick Voyage */}
        {step === 2 && (
          <div className={styles.wizardPanel}>
            <div className={styles.wizardTitle}>Pick a Voyage</div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Available Sailings — {selectedContract?.serviceCode}</label>
              {voyages.map((v: any) => {
                const ports = [...v.portCalls].sort((a: any, b: any) => a.sequence - b.sequence);
                return (
                  <div
                    key={v._id}
                    className={`${styles.voyageOption} ${selectedVoyageId === v._id ? styles['voyageOption--selected'] : ''}`}
                    onClick={() => setSelectedVoyageId(v._id)}
                  >
                    <div className={styles.voyageOptionHeader}>
                      <span className={styles.voyageOptionNum}>{v.voyageNumber}</span>
                      <span className={styles.voyageOptionVessel}>{v.vesselName}</span>
                      <span className={styles.voyageOptionDep}>Dep. {fmtDate(v.departureDate)}</span>
                    </div>
                    <div className={styles.portChain}>
                      {ports.map((pc: any, i: number) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className={`${styles.portDot} ${pc.operations?.includes('LOAD') ? styles['portDot--load'] : styles['portDot--discharge']}`}>
                            {countryFlag(pc.country)} {pc.portCode}
                          </span>
                          {i < ports.length - 1 && <span className={styles.portArrow} style={{ fontSize: '11px' }}> →</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.wizardActions}>
              <button className={styles.btnSecondary} onClick={() => setStep(1)}>← Back</button>
              <button
                className={styles.btnPrimary}
                onClick={handleStep2Next}
                disabled={!selectedVoyageId}
              >
                Next: Cargo Details →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cargo Details */}
        {step === 3 && (
          <div className={styles.wizardPanel}>
            <div className={styles.wizardTitle}>Cargo Details</div>

            <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              <strong>{selectedContract?.contractNumber}</strong> · Voyage <strong>{selectedVoyage?.voyageNumber}</strong> · {selectedVoyage?.vesselName}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Cargo Type *</label>
              <select
                className={styles.formSelect}
                value={cargoType}
                onChange={e => setCargoType(e.target.value)}
              >
                <option value="">— Select cargo type —</option>
                {contractCargoTypes.map((ct: string) => (
                  <option key={ct} value={ct}>{ct.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Quantity (pallets) *</label>
              <input
                className={styles.formInput}
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 300"
              />
              {weeklyHint && (
                <div className={styles.formHint}>
                  Contract weekly estimate: {weeklyHint} pallets
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Requested Temperature (°C, optional)</label>
              <input
                className={styles.formInput}
                type="number"
                step={0.5}
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                placeholder="e.g. 13.5"
              />
              <div className={styles.formHint}>
                Leave blank to use the contract default temperature.
              </div>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.wizardActions}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)} disabled={isPending}>← Back</button>
              <button
                className={styles.btnPrimary}
                onClick={handleSubmit}
                disabled={isPending || !cargoType || !quantity}
              >
                {isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
