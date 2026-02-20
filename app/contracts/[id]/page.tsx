import AppShell from '@/components/layout/AppShell';
import { getContractById } from '@/app/actions/contract';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import DeactivateButton from './DeactivateButton';

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCargo(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getContractById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const c = result.data as any;
  const clientType = c.client?.type || 'SHIPPER';
  const counterparties = clientType === 'SHIPPER' ? c.consignees : c.shippers;
  const counterpartyLabel = clientType === 'SHIPPER' ? 'Consignees' : 'Shippers';
  const totalWeekly = (counterparties || []).reduce(
    (sum: number, cp: any) => sum + (cp.weeklyEstimate || 0),
    0
  );

  const serviceName = c.serviceId?.serviceName || c.serviceCode || '—';
  const serviceCode = c.serviceId?.serviceCode || c.serviceCode || '—';
  const officeName = c.officeId?.name || c.officeCode || '—';

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Link href="/contracts" className={styles.backLink}>
              ← Back to Contracts
            </Link>
            <div className={styles.headerTitle}>
              <h1 className={styles.contractNumber}>{c.contractNumber}</h1>
              <span
                className={styles.badge}
                style={{
                  background: c.active ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                  color: c.active ? 'var(--color-success)' : 'var(--color-danger)',
                }}
              >
                {c.active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {c.active && <DeactivateButton contractId={c._id} contractNumber={c.contractNumber} />}
          </div>
        </div>

        {/* Cards grid */}
        <div className={styles.cardsGrid}>
          {/* Client Info */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Client Information</h2>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Type</span>
                <span className={styles.detailValue}>
                  <span className={styles.typeBadge}>{clientType}</span>
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Name</span>
                <span className={styles.detailValue}>{c.client?.name || '—'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Client #</span>
                <span className={styles.detailValueMono}>{c.client?.clientNumber || '—'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Contact</span>
                <span className={styles.detailValue}>{c.client?.contact || '—'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Email</span>
                <span className={styles.detailValue}>{c.client?.email || '—'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Country</span>
                <span className={styles.detailValue}>{c.client?.country || '—'}</span>
              </div>
            </div>
          </div>

          {/* Route & Service */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Route & Service</h2>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Service</span>
                <span className={styles.detailValue}>{serviceCode} — {serviceName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Office</span>
                <span className={styles.detailValue}>{c.officeCode} — {officeName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Origin</span>
                <span className={styles.detailValueMono}>
                  {c.originPort?.portCode || '—'} — {c.originPort?.portName || ''}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Destination</span>
                <span className={styles.detailValueMono}>
                  {c.destinationPort?.portCode || '—'} — {c.destinationPort?.portName || ''}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Valid From</span>
                <span className={styles.detailValue}>{fmtDate(c.validFrom)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Valid To</span>
                <span className={styles.detailValue}>{fmtDate(c.validTo)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Total Weekly Estimate</span>
                <span className={styles.detailValueHighlight}>{totalWeekly} pallets</span>
              </div>
            </div>
          </div>
        </div>

        {/* Counterparties */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{counterpartyLabel}</h2>
          {!counterparties || counterparties.length === 0 ? (
            <p className={styles.emptyText}>No {counterpartyLabel.toLowerCase()} registered.</p>
          ) : (
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th className={styles.thRight}>Weekly Est.</th>
                    <th>Cargo Types</th>
                  </tr>
                </thead>
                <tbody>
                  {counterparties.map((cp: any, idx: number) => (
                    <tr key={idx}>
                      <td>{cp.name}</td>
                      <td className={styles.cellMono}>{cp.code}</td>
                      <td className={styles.cellRight}>{cp.weeklyEstimate}</td>
                      <td>
                        <div className={styles.cargoChips}>
                          {(cp.cargoTypes || []).map((ct: string) => (
                            <span key={ct} className={styles.cargoTag}>{formatCargo(ct)}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
