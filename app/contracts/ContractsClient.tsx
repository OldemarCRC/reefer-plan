'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContract } from '@/app/actions/contract';
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
  officeCode: string;
  serviceCode: string;
  serviceName: string;
  originPort: string;
  destinationPort: string;
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

interface ContractsClientProps {
  contracts: DisplayContract[];
  offices: OfficeOption[];
  services: ServiceOption[];
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
// Create Contract Modal
// ---------------------------------------------------------------------------

function CreateContractModal({
  offices,
  services,
  onClose,
}: {
  offices: OfficeOption[];
  services: ServiceOption[];
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
  const [serviceId, setServiceId] = useState('');
  const [originPort, setOriginPort] = useState('');
  const [destinationPort, setDestinationPort] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [counterparties, setCounterparties] = useState<CounterpartyForm[]>([emptyCounterparty()]);

  // Derive ports from selected service
  const selectedService = services.find((s) => s._id === serviceId);
  const ports = useMemo(() => {
    if (!selectedService?.portRotation) return [];
    return [...selectedService.portRotation].sort((a, b) => a.sequence - b.sequence);
  }, [selectedService]);

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

  const originPortData = ports.find((p) => p.portCode === originPort);
  const destPortData = ports.find((p) => p.portCode === destinationPort);

  const handleSubmit = () => {
    setErrorMsg(null);

    if (!officeId || !clientName || !clientContact || !clientEmail || !clientCountry) {
      setErrorMsg('Please fill in all client fields.');
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
    if (validCounterparties.length === 0) {
      setErrorMsg('Add at least one counterparty with name, code, and cargo types.');
      return;
    }

    const payload = {
      officeId,
      client: {
        type: clientType,
        name: clientName,
        contact: clientContact,
        email: clientEmail,
        country: clientCountry,
      },
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
                  <input className={styles.formInput} value={cp.code} onChange={(e) => updateCounterparty(idx, 'code', e.target.value)} placeholder="e.g. SHP01" maxLength={20} />
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
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsClient({ contracts, offices, services }: ContractsClientProps) {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
                <th className={styles.thRight}>Weekly Est.</th>
                <th>Valid From</th>
                <th>Valid To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.cellMuted} style={{ textAlign: 'center', padding: '2rem' }}>
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
                    <td className={styles.cellRight}>{c.weeklyEstimate}</td>
                    <td className={styles.cellMuted}>{fmtDate(c.validFrom)}</td>
                    <td className={styles.cellMuted}>{fmtDate(c.validTo)}</td>
                    <td><StatusBadge active={c.active} /></td>
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
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
