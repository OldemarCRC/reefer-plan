'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { getActiveServices } from '@/app/actions/service';
import { getVessels } from '@/app/actions/vessel';
import { createVoyageFromWizard } from '@/app/actions/voyage';
import styles from './page.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceData {
  _id: string;
  serviceCode: string;
  serviceName: string;
  portRotation: {
    portCode: string;
    portName: string;
    country: string;
    sequence: number;
    weeksFromStart: number;
    operations: string[];
  }[];
  cargoTypes: string[];
}

interface VesselData {
  _id: string;
  name: string;
  imoNumber?: string;
  flag?: string;
}

interface PortScheduleEntry {
  portCode: string;
  portName: string;
  country: string;
  sequence: number;
  operations: string[];
  eta: string;
  etd: string;
  included: boolean; // false = omit from this voyage (not stored in portCalls)
}

type Step = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addWeeks(baseDate: Date, weeks: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Service' },
  { n: 2, label: 'Vessel' },
  { n: 3, label: 'Dates' },
  { n: 4, label: 'Review' },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function NewVoyagePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [vessels, setVessels] = useState<VesselData[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<VesselData | null>(null);
  const [voyageNumber, setVoyageNumber] = useState('');
  const [weekNumber, setWeekNumber] = useState<number | ''>('');
  const [portSchedule, setPortSchedule] = useState<PortScheduleEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    Promise.all([
      getActiveServices().then(r => (r.success ? r.data : [])),
      getVessels().catch(() => []),
    ]).then(([svcs, vsls]) => {
      setServices(svcs ?? []);
      setVessels(Array.isArray(vsls) ? vsls : []);
      setLoading(false);
    });
  }, []);

  const handleServiceSelect = (service: ServiceData) => {
    setSelectedService(service);
    const today = new Date();
    const schedule: PortScheduleEntry[] = (service.portRotation ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(p => ({
        portCode: p.portCode,
        portName: p.portName,
        country: p.country,
        sequence: p.sequence,
        operations: p.operations ?? ['LOAD'],
        eta: addWeeks(today, p.weeksFromStart ?? 0),
        etd: addWeeks(today, p.weeksFromStart ?? 0),
        included: true,
      }));
    setPortSchedule(schedule);
  };

  const handleVesselSelect = (vessel: VesselData) => {
    setSelectedVessel(vessel);
  };

  const handlePortDateChange = (seq: number, field: 'eta' | 'etd', value: string) => {
    setPortSchedule(prev =>
      prev.map(p => (p.sequence === seq ? { ...p, [field]: value } : p))
    );
  };

  const handlePortToggle = (portCode: string) => {
    setPortSchedule(prev =>
      prev.map(p => (p.portCode === portCode ? { ...p, included: !p.included } : p))
    );
  };

  const handleCreate = async () => {
    if (!selectedService || !selectedVessel || !voyageNumber) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const includedPorts = portSchedule.filter(p => p.included);
      const result = await createVoyageFromWizard({
        voyageNumber,
        weekNumber: weekNumber !== '' ? weekNumber : undefined,
        serviceId: selectedService._id,
        vesselId: selectedVessel._id,
        vesselName: selectedVessel.name,
        departureDate: includedPorts[0]?.eta || new Date().toISOString().split('T')[0],
        portCalls: includedPorts.map(p => ({
          portCode: p.portCode,
          portName: p.portName,
          country: p.country,
          sequence: p.sequence,
          eta: p.eta || undefined,
          etd: p.etd || undefined,
          operations: p.operations as ('LOAD' | 'DISCHARGE')[],
        })),
      });
      if (result.success) {
        router.push('/voyages');
      } else {
        setSubmitError(result.error ?? 'Failed to create voyage');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const includedPortCount = portSchedule.filter(p => p.included).length;
  const nextEnabled =
    (step === 1 && !!selectedService) ||
    (step === 2 && !!selectedVessel) ||
    (step === 3 && !!voyageNumber && voyageNumber.length >= 4 && includedPortCount >= 2);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1>New Voyage</h1>
            <Link href="/voyages" className={styles.cancelBtn}>Cancel</Link>
          </div>

          {/* Step indicator */}
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s.n} className={styles.stepGroup}>
                <div className={`${styles.step} ${step === s.n ? styles.active : ''} ${step > s.n ? styles.completed : ''}`}>
                  <div className={styles.stepNumber}>{step > s.n ? '✓' : s.n}</div>
                  <span className={styles.stepLabel}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={styles.stepConnector} />}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading data…</div>
          ) : (
            <>
              {/* ---- STEP 1: Service ---- */}
              {step === 1 && (
                <div className={styles.stepContent}>
                  <h2>Select Service</h2>
                  <p className={styles.stepDescription}>
                    Choose the shipping service. The standard port rotation will be pre-loaded for the next step.
                  </p>
                  <div className={styles.cardGrid}>
                    {services.map(svc => (
                      <div
                        key={svc._id}
                        className={`${styles.selectCard} ${selectedService?._id === svc._id ? styles.selected : ''}`}
                        onClick={() => handleServiceSelect(svc)}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.cardCode}>{svc.serviceCode}</span>
                          <span className={styles.cardBadge}>Weekly</span>
                        </div>
                        <div className={styles.cardName}>{svc.serviceName}</div>
                        <div className={styles.portRoute}>
                          {(svc.portRotation ?? [])
                            .slice()
                            .sort((a, b) => a.sequence - b.sequence)
                            .map((p, i) => (
                              <span key={p.portCode} className={styles.portRouteItem}>
                                {i > 0 && <span className={styles.routeArrow}>→</span>}
                                <span className={styles.routePort}>{p.portName}</span>
                              </span>
                            ))}
                        </div>
                        {(svc.cargoTypes ?? []).length > 0 && (
                          <div className={styles.cargoChips}>
                            {svc.cargoTypes.slice(0, 3).map(c => (
                              <span key={c} className={styles.cargoChip}>
                                {c.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- STEP 2: Vessel ---- */}
              {step === 2 && (
                <div className={styles.stepContent}>
                  <h2>Select Vessel</h2>
                  <p className={styles.stepDescription}>
                    Choose the vessel that will operate this <strong>{selectedService?.serviceCode}</strong> voyage.
                  </p>
                  <div className={styles.cardGrid}>
                    {vessels.map(vessel => (
                      <div
                        key={vessel._id}
                        className={`${styles.selectCard} ${selectedVessel?._id === vessel._id ? styles.selected : ''}`}
                        onClick={() => handleVesselSelect(vessel)}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.cardCode}>IMO {vessel.imoNumber ?? '—'}</span>
                          <span className={styles.cardBadge}>{vessel.flag ?? '—'}</span>
                        </div>
                        <div className={styles.cardName}>{vessel.name}</div>
                        <div className={styles.vesselSpec}>Reefer Vessel</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- STEP 3: Dates ---- */}
              {step === 3 && (
                <div className={styles.stepContent}>
                  <h2>Set Port Schedule</h2>
                  <p className={styles.stepDescription}>
                    Enter the voyage number and set ETA and ETD for each port call.
                  </p>

                  <div className={styles.voyageNumberRow}>
                    <label className={styles.fieldLabel}>Voyage Number</label>
                    <input
                      type="text"
                      className={styles.voyageNumberInput}
                      value={voyageNumber}
                      onChange={e => setVoyageNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. ACON-062026"
                      required
                      maxLength={30}
                      pattern="[A-Z0-9-]+"
                      title="Uppercase letters, numbers, and hyphens only"
                    />
                  </div>

                  <div className={styles.voyageNumberRow}>
                    <label className={styles.fieldLabel}>Week Number</label>
                    <input
                      type="number"
                      className={styles.voyageNumberInput}
                      value={weekNumber}
                      onChange={e => setWeekNumber(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      min={1}
                      max={53}
                      placeholder="1–53"
                    />
                  </div>

                  <div className={styles.portTable}>
                    <div className={styles.portTableHeader}>
                      <span></span>
                      <span>Port</span>
                      <span>Operations</span>
                      <span>ETA</span>
                      <span>ETD</span>
                    </div>
                    {portSchedule.map(p => (
                      <div
                        key={p.portCode}
                        className={`${styles.portTableRow} ${!p.included ? styles.portRowExcluded : ''}`}
                      >
                        <input
                          type="checkbox"
                          className={styles.portCheckbox}
                          checked={p.included}
                          onChange={() => handlePortToggle(p.portCode)}
                        />
                        <div className={styles.portCellInfo}>
                          <span className={styles.portCellCode}>{p.portCode}</span>
                          <span className={styles.portCellName}>{p.portName}, {p.country}</span>
                        </div>
                        <div className={styles.portCellOps}>
                          {p.operations.map(op => (
                            <span key={op} className={`${styles.opChip} ${op === 'LOAD' ? styles.opLoad : styles.opDischarge}`}>
                              {op}
                            </span>
                          ))}
                        </div>
                        {p.included ? (
                          <>
                            <input
                              type="date"
                              className={styles.dateInput}
                              value={p.eta}
                              onChange={e => handlePortDateChange(p.sequence, 'eta', e.target.value)}
                              required
                            />
                            <input
                              type="date"
                              className={styles.dateInput}
                              value={p.etd}
                              min={p.eta || undefined}
                              onChange={e => handlePortDateChange(p.sequence, 'etd', e.target.value)}
                              required
                            />
                          </>
                        ) : (
                          <span className={styles.portExcludedLabel} style={{ gridColumn: 'span 2' }}>
                            Not included this sailing
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- STEP 4: Review ---- */}
              {step === 4 && (
                <div className={styles.stepContent}>
                  <h2>Review & Create</h2>
                  <p className={styles.stepDescription}>Confirm the voyage details below before creating.</p>

                  <div className={styles.reviewGrid}>
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Voyage Number</span>
                      <span className={styles.reviewValue} style={{ fontFamily: "'Space Grotesk', monospace" }}>{voyageNumber}</span>
                    </div>
                    {weekNumber !== '' && (
                      <div className={styles.reviewItem}>
                        <span className={styles.reviewLabel}>Week Number</span>
                        <span className={styles.reviewValue}>WK{String(weekNumber).padStart(2, '0')}</span>
                      </div>
                    )}
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Service</span>
                      <span className={styles.reviewValue}>{selectedService?.serviceCode} — {selectedService?.serviceName}</span>
                    </div>
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Vessel</span>
                      <span className={styles.reviewValue}>{selectedVessel?.name}</span>
                    </div>
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Departure</span>
                      <span className={styles.reviewValue}>{portSchedule.filter(p => p.included)[0]?.eta ?? '—'}</span>
                    </div>
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Estimated Arrival</span>
                      <span className={styles.reviewValue}>{portSchedule.filter(p => p.included).slice(-1)[0]?.etd ?? '—'}</span>
                    </div>
                    <div className={styles.reviewItem}>
                      <span className={styles.reviewLabel}>Status</span>
                      <span className={styles.reviewValue}>PLANNED</span>
                    </div>
                  </div>

                  <div className={styles.reviewPortSection}>
                    <h3>Port Schedule ({portSchedule.filter(p => p.included).length} ports)</h3>
                    {portSchedule.filter(p => p.included).map(p => (
                      <div key={p.portCode} className={styles.reviewPortRow}>
                        <span className={styles.reviewSeq}>{p.sequence}</span>
                        <div className={styles.reviewPortInfo}>
                          <span className={styles.portCellCode}>{p.portCode}</span>
                          <span className={styles.portCellName}>{p.portName}</span>
                        </div>
                        <div className={styles.reviewPortDates}>
                          <span>ETA: {p.eta || '—'}</span>
                          <span className={styles.dateSep}>·</span>
                          <span>ETD: {p.etd || '—'}</span>
                        </div>
                        <div className={styles.portCellOps}>
                          {p.operations.map(op => (
                            <span key={op} className={`${styles.opChip} ${op === 'LOAD' ? styles.opLoad : styles.opDischarge}`}>
                              {op}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {submitError && (
                    <div className={styles.errorBox}>{submitError}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <div className={styles.actions}>
          {step > 1 && (
            <button
              className={styles.btnSecondary}
              onClick={() => setStep(prev => (prev - 1) as Step)}
            >
              ← Back
            </button>
          )}
          {step < 4 ? (
            <button
              className={styles.btnPrimary}
              disabled={!nextEnabled}
              onClick={() => setStep(prev => (prev + 1) as Step)}
            >
              Next →
            </button>
          ) : (
            <button
              className={styles.btnPrimary}
              disabled={isSubmitting}
              onClick={handleCreate}
            >
              {isSubmitting ? 'Creating…' : 'Create Voyage'}
            </button>
          )}
        </div>

      </div>
    </AppShell>
  );
}
