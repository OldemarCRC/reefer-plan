'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createContract, updateContract, deactivateContract, activateContract, getContractById } from '@/app/actions/contract';
import ContractShippersPanel from '@/app/contracts/[id]/ContractShippersPanel';
import styles from './page.module.css';
import type { CargoType } from '@/types/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisplayContract {
  _id: string;
  contractNumber: string;
  clientName: string;
  clientType: 'SHIPPER' | 'CONSIGNEE';
  clientContact: string;
  clientEmail: string;
  clientCountry: string;
  officeCode: string;
  officeId: string;
  serviceCode: string;
  serviceName: string;
  serviceId: string;
  originPort: string;
  originPortName: string;
  originPortCountry: string;
  destinationPort: string;
  destinationPortName: string;
  destinationPortCountry: string;
  cargoType: string;
  weeklyPallets: number;
  weeklyEstimate: number;
  validFrom: string;
  validTo: string;
  active: boolean;
}

interface OfficeOption {
  _id: string;
  code: string;
  name: string;
  country: string;
}

interface ServiceOption {
  _id: string;
  serviceCode: string;
  serviceName: string;
  shortCode?: string;
  portRotation?: Array<{
    portCode: string;
    portName: string;
    country: string;
    sequence: number;
    operations: string[];
  }>;
}

interface CounterpartyForm {
  name: string;
  code: string;
  weeklyEstimate: string;
  cargoTypes: CargoType[];
}

interface ShipperOption {
  _id: string;
  name: string;
  code: string;
}

interface ContractsClientProps {
  contracts: DisplayContract[];
  offices: OfficeOption[];
  services: ServiceOption[];
  shippers?: ShipperOption[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARGO_TYPES: CargoType[] = [
  'BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'FROZEN_FISH', 'TABLE_GRAPES',
  'CITRUS', 'AVOCADOS', 'BERRIES', 'KIWIS', 'PINEAPPLES', 'CHERRIES',
  'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS', 'PAPAYA',
  'MANGOES', 'OTHER_FROZEN', 'OTHER_CHILLED',
];

const statusStyles: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: 'var(--color-success-muted)', color: 'var(--color-success)' },
  INACTIVE: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ active }: { active: boolean }) {
  const label = active ? 'ACTIVE' : 'INACTIVE';
  const s = statusStyles[label];
  return (
    <span className={styles.badge} style={{ background: s.bg, color: s.color }}>
      {label}
    </span>
  );
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatCargo(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function emptyCounterparty(): CounterpartyForm {
  return { name: '', code: '', weeklyEstimate: '', cargoTypes: [] };
}

// ---------------------------------------------------------------------------
// Shipper selection row (multi) — for CONSIGNEE contracts in create modal
// ---------------------------------------------------------------------------

interface ConsigneeShipperRow {
  shipperId: string;
  weeklyEstimate: string;
  cargoTypes: CargoType[];
}

function emptyShipperRow(): ConsigneeShipperRow {
  return { shipperId: '', weeklyEstimate: '', cargoTypes: [] };
}

// ---------------------------------------------------------------------------
// Create Contract Modal
// ---------------------------------------------------------------------------

function CreateContractModal({
  offices,
  services,
  shippers = [],
  onClose,
}: {
  offices: OfficeOption[];
  services: ServiceOption[];
  shippers?: ShipperOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [officeId, setOfficeId] = useState('');
  const [clientType, setClientType] = useState<'SHIPPER' | 'CONSIGNEE'>('SHIPPER');
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientCountry, setClientCountry] = useState('');
  const [cargoType, setCargoType] = useState<CargoType | ''>('');
  const [weeklyPallets, setWeeklyPallets] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [originPort, setOriginPort] = useState('');
  const [destinationPort, setDestinationPort] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  // SHIPPER contract: free-text consignees
  const [counterparties, setCounterparties] = useState<CounterpartyForm[]>([emptyCounterparty()]);

  // CONSIGNEE contract: multi-shipper rows
  const [shipperRows, setShipperRows] = useState<ConsigneeShipperRow[]>([emptyShipperRow()]);

  // Derive ports from selected service
  const selectedService = services.find((s) => s._id === serviceId);
  const ports = useMemo(() => {
    if (!selectedService?.portRotation) return [];
    return [...selectedService.portRotation].sort((a, b) => a.sequence - b.sequence);
  }, [selectedService]);

  // --- Counterparty helpers (SHIPPER contract) ---
  const addCounterparty = () => setCounterparties([...counterparties, emptyCounterparty()]);
  const removeCounterparty = (idx: number) => {
    if (counterparties.length <= 1) return;
    setCounterparties(counterparties.filter((_, i) => i !== idx));
  };
  const updateCounterparty = (idx: number, field: keyof CounterpartyForm, value: any) => {
    const updated = [...counterparties];
    updated[idx] = { ...updated[idx], [field]: value };
    setCounterparties(updated);
  };
  const toggleCargoType = (idx: number, ct: CargoType) => {
    const cp = counterparties[idx];
    const types = cp.cargoTypes.includes(ct)
      ? cp.cargoTypes.filter((t) => t !== ct)
      : [...cp.cargoTypes, ct];
    updateCounterparty(idx, 'cargoTypes', types);
  };

  // --- Shipper row helpers (CONSIGNEE contract) ---
  const addShipperRow = () => setShipperRows([...shipperRows, emptyShipperRow()]);
  const removeShipperRow = (idx: number) => {
    if (shipperRows.length <= 1) return;
    setShipperRows(shipperRows.filter((_, i) => i !== idx));
  };
  const updateShipperRow = (idx: number, field: keyof ConsigneeShipperRow, value: any) => {
    const updated = [...shipperRows];
    updated[idx] = { ...updated[idx], [field]: value };
    setShipperRows(updated);
  };
  const toggleShipperRowCargo = (idx: number, ct: CargoType) => {
    const row = shipperRows[idx];
    const types = row.cargoTypes.includes(ct)
      ? row.cargoTypes.filter((t) => t !== ct)
      : [...row.cargoTypes, ct];
    updateShipperRow(idx, 'cargoTypes', types);
  };

  // Weekly total for CONSIGNEE shippers vs weeklyPallets
  const shipperWeeklyTotal = shipperRows
    .filter((r) => r.shipperId)
    .reduce((s, r) => s + (parseInt(r.weeklyEstimate) || 0), 0);
  const palletLimit = parseInt(weeklyPallets) || 0;

  const originPortData = ports.find((p) => p.portCode === originPort);
  const destPortData = ports.find((p) => p.portCode === destinationPort);

  const handleSubmit = () => {
    setErrorMsg(null);

    if (!officeId || !clientName || !clientContact || !clientEmail || !clientCountry) {
      setErrorMsg('Please fill in all client fields.');
      return;
    }
    if (!cargoType) {
      setErrorMsg('Please select a cargo type.');
      return;
    }
    if (!weeklyPallets || parseInt(weeklyPallets) < 1) {
      setErrorMsg('Weekly pallets must be at least 1.');
      return;
    }
    if (!serviceId || !originPort || !destinationPort) {
      setErrorMsg('Please select service, origin port, and destination port.');
      return;
    }
    if (!validFrom || !validTo) {
      setErrorMsg('Please set validity dates.');
      return;
    }

    const validCounterparties = counterparties.filter((cp) => cp.name && cp.code && cp.cargoTypes.length > 0);
    if (clientType === 'SHIPPER' && validCounterparties.length === 0) {
      setErrorMsg('Add at least one consignee with name, code, and cargo types.');
      return;
    }

    // Build counterparties for CONSIGNEE: validate selected shippers have cargo types
    const validShipperRows = shipperRows.filter((r) => r.shipperId && r.cargoTypes.length > 0);

    const payload = {
      officeId,
      client: {
        type: clientType,
        name: clientName,
        contact: clientContact,
        email: clientEmail,
        country: clientCountry,
      },
      cargoType: cargoType as CargoType,
      weeklyPallets: parseInt(weeklyPallets),
      shippers: clientType === 'CONSIGNEE'
        ? validCounterparties.map((cp) => ({
            name: cp.name,
            code: cp.code,
            weeklyEstimate: parseInt(cp.weeklyEstimate) || 0,
            cargoTypes: cp.cargoTypes,
          }))
        : [],
      consignees: clientType === 'SHIPPER'
        ? validCounterparties.map((cp) => ({
            name: cp.name,
            code: cp.code,
            weeklyEstimate: parseInt(cp.weeklyEstimate) || 0,
            cargoTypes: cp.cargoTypes,
          }))
        : [],
      counterparties: clientType === 'CONSIGNEE'
        ? validShipperRows.map((r) => {
            const s = shippers.find((sh) => sh._id === r.shipperId)!;
            return {
              shipperId: r.shipperId,
              shipperName: s?.name ?? '',
              shipperCode: s?.code ?? '',
              weeklyEstimate: parseInt(r.weeklyEstimate) || 0,
              cargoTypes: r.cargoTypes,
            };
          })
        : [],
      serviceId,
      originPort: {
        portCode: originPortData!.portCode,
        portName: originPortData!.portName,
        country: originPortData!.country,
      },
      destinationPort: {
        portCode: destPortData!.portCode,
        portName: destPortData!.portName,
        country: destPortData!.country,
      },
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
    };

    startTransition(async () => {
      const result = await createContract(payload);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setErrorMsg(result.error || 'Failed to create contract');
      }
    });
  };

  const counterpartyLabel = clientType === 'SHIPPER' ? 'Consignees' : 'Shippers';

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>New Contract</h3>

        <div className={styles.modalScroll}>
          {/* Office */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Office</label>
            <select className={styles.formSelect} value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
              <option value="">Select office...</option>
              {offices.map((o) => (
                <option key={o._id} value={o._id}>{o.code} — {o.name}</option>
              ))}
            </select>
          </div>

          {/* Client type */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Client Type</label>
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${clientType === 'SHIPPER' ? styles['toggleBtn--active'] : ''}`}
                onClick={() => setClientType('SHIPPER')}
              >
                Shipper
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${clientType === 'CONSIGNEE' ? styles['toggleBtn--active'] : ''}`}
                onClick={() => setClientType('CONSIGNEE')}
              >
                Consignee
              </button>
            </div>
          </div>

          {/* Client info */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Client Name</label>
            <input className={styles.formInput} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Company name" required maxLength={120} />
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Contact</label>
              <input className={styles.formInput} value={clientContact} onChange={(e) => setClientContact(e.target.value)} placeholder="Contact person" required maxLength={120} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@example.com" required maxLength={200} />
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Country</label>
            <input className={styles.formInput} value={clientCountry} onChange={(e) => setClientCountry(e.target.value)} placeholder="e.g. Netherlands" required maxLength={60} />
          </div>

          {/* Cargo type + weekly pallets */}
          <div className={styles.formDivider} />
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Primary Cargo Type</label>
              <select className={styles.formSelect} value={cargoType} onChange={(e) => setCargoType(e.target.value as CargoType)}>
                <option value="">Select cargo...</option>
                {CARGO_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{formatCargo(ct)}</option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Weekly Pallets (contract cap)</label>
              <input
                className={styles.formInput}
                type="number"
                min="1"
                value={weeklyPallets}
                onChange={(e) => setWeeklyPallets(e.target.value)}
                placeholder="e.g. 200"
              />
            </div>
          </div>

          {/* Service & Route */}
          <div className={styles.formDivider} />
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Service</label>
            <select className={styles.formSelect} value={serviceId} onChange={(e) => { setServiceId(e.target.value); setOriginPort(''); setDestinationPort(''); }}>
              <option value="">Select service...</option>
              {services.filter((s: any) => s.active !== false).map((s) => (
                <option key={s._id} value={s._id}>{s.serviceCode} — {s.serviceName}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Origin Port</label>
              <select className={styles.formSelect} value={originPort} onChange={(e) => setOriginPort(e.target.value)} disabled={!serviceId}>
                <option value="">Select port...</option>
                {ports.map((p) => (
                  <option key={p.portCode} value={p.portCode}>{p.portCode} — {p.portName}</option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Destination Port</label>
              <select className={styles.formSelect} value={destinationPort} onChange={(e) => setDestinationPort(e.target.value)} disabled={!serviceId}>
                <option value="">Select port...</option>
                {ports.map((p) => (
                  <option key={p.portCode} value={p.portCode}>{p.portCode} — {p.portName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Validity */}
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Valid From</label>
              <input className={styles.formInput} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Valid To</label>
              <input className={styles.formInput} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} required min={validFrom || undefined} />
            </div>
          </div>

          {/* Counterparties */}
          <div className={styles.formDivider} />
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{counterpartyLabel}</label>
          </div>

          {clientType === 'CONSIGNEE' ? (
            /* CONSIGNEE contract: multi-shipper rows */
            <>
              {palletLimit > 0 && (
                <div className={`${styles.weeklyBar} ${shipperWeeklyTotal > palletLimit ? styles.weeklyBarOver : shipperWeeklyTotal === palletLimit ? styles.weeklyBarExact : ''}`}>
                  Shipper total: <strong>{shipperWeeklyTotal}</strong> / {palletLimit} pallets/week
                  {shipperWeeklyTotal > palletLimit && ' — over contract capacity'}
                  {shipperWeeklyTotal === palletLimit && ' — exactly at contract capacity'}
                </div>
              )}
              {shipperRows.map((row, idx) => {
                const assignedIds = new Set(shipperRows.filter((_, i) => i !== idx).map((r) => r.shipperId).filter(Boolean));
                const available = shippers.filter((s) => !assignedIds.has(s._id));
                return (
                  <div key={idx} className={styles.counterpartyCard}>
                    <div className={styles.counterpartyHeader}>
                      <span className={styles.counterpartyIdx}>#{idx + 1}</span>
                      {shipperRows.length > 1 && (
                        <button type="button" className={styles.btnRemove} onClick={() => removeShipperRow(idx)}>Remove</button>
                      )}
                    </div>
                    <div className={styles.formGrid2}>
                      <div className={styles.formRow}>
                        <label className={styles.formLabel}>Shipper</label>
                        <select
                          className={styles.formSelect}
                          value={row.shipperId}
                          onChange={(e) => updateShipperRow(idx, 'shipperId', e.target.value)}
                        >
                          <option value="">— Select shipper (optional) —</option>
                          {available.map((s) => (
                            <option key={s._id} value={s._id}>{s.code} — {s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formRow}>
                        <label className={styles.formLabel}>Weekly Estimate (pallets)</label>
                        <input
                          className={styles.formInput}
                          type="number"
                          min="0"
                          value={row.weeklyEstimate}
                          onChange={(e) => updateShipperRow(idx, 'weeklyEstimate', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Cargo Types</label>
                      <div className={styles.cargoChips}>
                        {CARGO_TYPES.map((ct) => (
                          <button
                            key={ct}
                            type="button"
                            className={`${styles.cargoChip} ${row.cargoTypes.includes(ct) ? styles['cargoChip--active'] : ''}`}
                            onClick={() => toggleShipperRowCargo(idx, ct)}
                          >
                            {formatCargo(ct)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button type="button" className={styles.btnAddCp} onClick={addShipperRow}>
                + Add Shipper
              </button>
              <span className={styles.formHint}>
                Shippers can be added later from the contract detail page.
              </span>
            </>
          ) : (
            /* SHIPPER contract: free-text consignees */
            <>
              {counterparties.map((cp, idx) => (
                <div key={idx} className={styles.counterpartyCard}>
                  <div className={styles.counterpartyHeader}>
                    <span className={styles.counterpartyIdx}>#{idx + 1}</span>
                    {counterparties.length > 1 && (
                      <button type="button" className={styles.btnRemove} onClick={() => removeCounterparty(idx)}>Remove</button>
                    )}
                  </div>
                  <div className={styles.formGrid2}>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Name</label>
                      <input className={styles.formInput} value={cp.name} onChange={(e) => updateCounterparty(idx, 'name', e.target.value)} placeholder="Company name" maxLength={120} />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Code</label>
                      <input className={styles.formInput} value={cp.code} onChange={(e) => updateCounterparty(idx, 'code', e.target.value)} placeholder="e.g. CNS01" maxLength={20} />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Weekly Estimate (pallets)</label>
                    <input className={styles.formInput} type="number" min="0" value={cp.weeklyEstimate} onChange={(e) => updateCounterparty(idx, 'weeklyEstimate', e.target.value)} placeholder="0" />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Cargo Types</label>
                    <div className={styles.cargoChips}>
                      {CARGO_TYPES.map((ct) => (
                        <button
                          key={ct}
                          type="button"
                          className={`${styles.cargoChip} ${cp.cargoTypes.includes(ct) ? styles['cargoChip--active'] : ''}`}
                          onClick={() => toggleCargoType(idx, ct)}
                        >
                          {formatCargo(ct)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className={styles.btnAddCp} onClick={addCounterparty}>
                + Add {counterpartyLabel.slice(0, -1)}
              </button>
            </>
          )}
        </div>

        {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Contract'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Contract Modal
// ---------------------------------------------------------------------------

function EditContractModal({
  contract,
  offices,
  services,
  shippers = [],
  onClose,
}: {
  contract: DisplayContract;
  offices: OfficeOption[];
  services: ServiceOption[];
  shippers?: ShipperOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [counterparties, setCounterparties] = useState<any[]>([]);

  useEffect(() => {
    getContractById(contract._id).then(res => {
      if (res.success && (res.data as any)?.counterparties) {
        setCounterparties((res.data as any).counterparties);
      }
    });
  }, [contract._id]);

  const [clientName, setClientName] = useState(contract.clientName);
  const [clientContact, setClientContact] = useState(contract.clientContact);
  const [clientEmail, setClientEmail] = useState(contract.clientEmail);
  const [clientCountry, setClientCountry] = useState(contract.clientCountry);
  const [cargoType, setCargoType] = useState<CargoType | ''>(contract.cargoType as CargoType || '');
  const [weeklyPallets, setWeeklyPallets] = useState(String(contract.weeklyPallets || ''));
  const [validFrom, setValidFrom] = useState(contract.validFrom ? contract.validFrom.slice(0, 10) : '');
  const [validTo, setValidTo] = useState(contract.validTo ? contract.validTo.slice(0, 10) : '');

  // Route: we keep the same service but allow changing ports
  const selectedService = services.find((s) => s._id === contract.serviceId);
  const ports = useMemo(() => {
    if (!selectedService?.portRotation) return [];
    return [...selectedService.portRotation].sort((a, b) => a.sequence - b.sequence);
  }, [selectedService]);

  const [originPort, setOriginPort] = useState(contract.originPort);
  const [destinationPort, setDestinationPort] = useState(contract.destinationPort);

  const handleSubmit = () => {
    setErrorMsg(null);
    if (!clientName || !clientContact || !clientEmail || !clientCountry) {
      setErrorMsg('Please fill in all client fields.');
      return;
    }
    if (!cargoType) {
      setErrorMsg('Please select a cargo type.');
      return;
    }
    if (!weeklyPallets || parseInt(weeklyPallets) < 1) {
      setErrorMsg('Weekly pallets must be at least 1.');
      return;
    }
    if (!originPort || !destinationPort) {
      setErrorMsg('Please select origin and destination ports.');
      return;
    }
    if (!validFrom || !validTo) {
      setErrorMsg('Please set validity dates.');
      return;
    }

    const originPortData = ports.find((p) => p.portCode === originPort);
    const destPortData = ports.find((p) => p.portCode === destinationPort);

    // If port codes are unchanged and no service port rotation data, send minimal update
    const updates: Record<string, any> = {
      client: {
        name: clientName,
        contact: clientContact,
        email: clientEmail,
        country: clientCountry,
      },
      cargoType,
      weeklyPallets: parseInt(weeklyPallets),
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
    };

    if (originPortData) {
      updates.originPort = { portCode: originPortData.portCode, portName: originPortData.portName, country: originPortData.country };
    } else if (originPort !== contract.originPort) {
      // User changed to a port we can't find — keep original
    }
    if (destPortData) {
      updates.destinationPort = { portCode: destPortData.portCode, portName: destPortData.portName, country: destPortData.country };
    }

    startTransition(async () => {
      const result = await updateContract(contract._id, updates);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setErrorMsg(result.error || 'Failed to update contract');
      }
    });
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Edit Contract — {contract.contractNumber}</h3>

        <div className={styles.modalScroll}>
          {/* Client info (type is read-only) */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Client Name</label>
            <input className={styles.formInput} value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={120} />
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Contact</label>
              <input className={styles.formInput} value={clientContact} onChange={(e) => setClientContact(e.target.value)} maxLength={120} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} maxLength={200} />
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Country</label>
            <input className={styles.formInput} value={clientCountry} onChange={(e) => setClientCountry(e.target.value)} maxLength={60} />
          </div>

          {/* Cargo + Pallets */}
          <div className={styles.formDivider} />
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Primary Cargo Type</label>
              <select className={styles.formSelect} value={cargoType} onChange={(e) => setCargoType(e.target.value as CargoType)}>
                <option value="">Select cargo...</option>
                {CARGO_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{formatCargo(ct)}</option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Weekly Pallets (contract cap)</label>
              <input
                className={styles.formInput}
                type="number"
                min="1"
                value={weeklyPallets}
                onChange={(e) => setWeeklyPallets(e.target.value)}
              />
            </div>
          </div>

          {/* Route */}
          <div className={styles.formDivider} />
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Service (read-only)</label>
            <input className={styles.formInput} value={`${contract.serviceCode} — ${contract.serviceName}`} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          {ports.length > 0 ? (
            <div className={styles.formGrid2}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Origin Port</label>
                <select className={styles.formSelect} value={originPort} onChange={(e) => setOriginPort(e.target.value)}>
                  {ports.map((p) => <option key={p.portCode} value={p.portCode}>{p.portCode} — {p.portName}</option>)}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Destination Port</label>
                <select className={styles.formSelect} value={destinationPort} onChange={(e) => setDestinationPort(e.target.value)}>
                  {ports.map((p) => <option key={p.portCode} value={p.portCode}>{p.portCode} — {p.portName}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className={styles.formGrid2}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Origin Port</label>
                <input className={styles.formInput} value={originPort} readOnly style={{ opacity: 0.6 }} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Destination Port</label>
                <input className={styles.formInput} value={destinationPort} readOnly style={{ opacity: 0.6 }} />
              </div>
            </div>
          )}

          {/* Validity */}
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Valid From</label>
              <input className={styles.formInput} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Valid To</label>
              <input className={styles.formInput} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} min={validFrom || undefined} />
            </div>
          </div>
        </div>

        {/* Shippers / Counterparties section — CONSIGNEE contracts only */}
        {shippers.length > 0 && contract.clientType === 'CONSIGNEE' && (
          <>
            <div className={styles.formDivider} />
            <ContractShippersPanel
              contractId={contract._id}
              contractActive={contract.active !== false}
              contractWeeklyPallets={parseInt(weeklyPallets) || contract.weeklyPallets}
              counterparties={counterparties}
              availableShippers={shippers.map(s => ({ id: s._id, name: s.name, code: s.code }))}
            />
          </>
        )}

        {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}

        <div className={styles.modalActions}>
          <button className={styles.btnModalCancel} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsClient({ contracts, offices, services, shippers = [] }: ContractsClientProps) {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editContract, setEditContract] = useState<DisplayContract | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (filterStatus === 'active' && !c.active) return false;
      if (filterStatus === 'inactive' && c.active) return false;
      if (filterType && c.clientType !== filterType) return false;
      if (filterService && c.serviceCode !== filterService) return false;
      if (filterOffice && c.officeCode !== filterOffice) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const match =
          c.contractNumber.toLowerCase().includes(q) ||
          c.clientName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [contracts, filterStatus, filterType, filterService, filterOffice, searchText]);

  const serviceOptions = useMemo(() => {
    return [...new Set(contracts.map((c) => c.serviceCode))].filter((s) => s !== '—').sort();
  }, [contracts]);

  const officeOptions = useMemo(() => {
    return [...new Set(contracts.map((c) => c.officeCode))].filter((o) => o !== '—').sort();
  }, [contracts]);

  function handleDeactivate(c: DisplayContract) {
    if (!confirm(`Deactivate contract ${c.contractNumber}?\n\nExisting bookings will not be affected.`)) return;
    setActionMsg(null);
    startTransition(async () => {
      const res = await deactivateContract(c._id);
      setActionMsg({ id: c._id, text: res.success ? `${c.contractNumber} deactivated` : (res.error ?? 'Failed'), ok: res.success });
      if (res.success) router.refresh();
    });
  }

  function handleActivate(c: DisplayContract) {
    setActionMsg(null);
    startTransition(async () => {
      const res = await activateContract(c._id);
      setActionMsg({ id: c._id, text: res.success ? `${c.contractNumber} activated` : (res.error ?? 'Failed'), ok: res.success });
      if (res.success) router.refresh();
    });
  }

  return (
    <>
      {/* Create button */}
      <div className={styles.actionBar}>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ New Contract</button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search by contract # or client..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select className={styles.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="SHIPPER">Shipper</option>
          <option value="CONSIGNEE">Consignee</option>
        </select>
        <select className={styles.select} value={filterService} onChange={(e) => setFilterService(e.target.value)}>
          <option value="">All Services</option>
          {serviceOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={styles.select} value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)}>
          <option value="">All Offices</option>
          {officeOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select className={styles.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {actionMsg && (
        <div className={actionMsg.ok ? styles.msgSuccess : styles.msgError}>{actionMsg.text}</div>
      )}

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Contract #</th>
                <th>Client</th>
                <th>Type</th>
                <th>Office</th>
                <th>Service</th>
                <th>Route</th>
                <th>Cargo</th>
                <th className={styles.thRight}>Wkly Pallets</th>
                <th>Valid From</th>
                <th>Valid To</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.cellMuted} style={{ textAlign: 'center', padding: '2rem' }}>
                    No contracts match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c._id}
                    className={`${styles.rowClickable} ${!c.active ? styles.rowInactive : ''}`}
                    onClick={() => router.push(`/contracts/${c._id}`)}
                  >
                    <td className={styles.cellMono}>{c.contractNumber}</td>
                    <td>{c.clientName}</td>
                    <td>
                      <span className={styles.typeBadge}>{c.clientType}</span>
                    </td>
                    <td className={styles.cellMuted}>{c.officeCode}</td>
                    <td className={styles.cellMuted}>{c.serviceCode}</td>
                    <td className={styles.cellRoute}>
                      <span>{c.originPort}</span>
                      <span className={styles.routeArrow}>→</span>
                      <span>{c.destinationPort}</span>
                    </td>
                    <td className={styles.cellMuted}>{c.cargoType ? formatCargo(c.cargoType) : '—'}</td>
                    <td className={styles.cellRight}>{c.weeklyPallets || '—'}</td>
                    <td className={styles.cellMuted}>{fmtDate(c.validFrom)}</td>
                    <td className={styles.cellMuted}>{fmtDate(c.validTo)}</td>
                    <td><StatusBadge active={c.active} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.rowActions}>
                        <button
                          className={`${styles.btnSmall} ${styles.btnSmallEdit}`}
                          disabled={isPending}
                          onClick={() => setEditContract(c)}
                        >
                          Edit
                        </button>
                        {c.active ? (
                          <button
                            className={`${styles.btnSmall} ${styles.btnSmallDeactivate}`}
                            disabled={isPending}
                            onClick={() => handleDeactivate(c)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className={`${styles.btnSmall} ${styles.btnSmallActivate}`}
                            disabled={isPending}
                            onClick={() => handleActivate(c)}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateContractModal
          offices={offices}
          services={services}
          shippers={shippers}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editContract && (
        <EditContractModal
          contract={editContract}
          offices={offices}
          services={services}
          shippers={shippers}
          onClose={() => setEditContract(null)}
        />
      )}
    </>
  );
}
