import AppShell from '@/components/layout/AppShell';
import { getContracts } from '@/app/actions/contract';
import { getActiveOffices } from '@/app/actions/office';
import { getServices } from '@/app/actions/service';
import ContractsClient from './ContractsClient';
import type { DisplayContract } from './ContractsClient';
import styles from './page.module.css';

export default async function ContractsPage() {
  const [contractsRes, officesRes, servicesRes] = await Promise.all([
    getContracts(),
    getActiveOffices(),
    getServices(),
  ]);

  const contracts = contractsRes.success ? contractsRes.data : [];
  const offices = officesRes.success ? officesRes.data : [];
  const services = servicesRes.success ? servicesRes.data : [];

  const displayContracts: DisplayContract[] = contracts.map((c: any) => {
    const counterparties = c.client?.type === 'SHIPPER' ? c.consignees : c.shippers;
    const totalWeekly = (counterparties || []).reduce(
      (sum: number, cp: any) => sum + (cp.weeklyEstimate || 0),
      0
    );

    return {
      _id: c._id,
      contractNumber: c.contractNumber,
      clientName: c.client?.name || 'Unknown',
      clientType: c.client?.type || 'SHIPPER',
      officeCode: c.officeCode || c.officeId?.code || '—',
      serviceCode: c.serviceCode || c.serviceId?.serviceCode || '—',
      serviceName: c.serviceId?.serviceName || '—',
      originPort: c.originPort?.portCode || '—',
      destinationPort: c.destinationPort?.portCode || '—',
      weeklyEstimate: totalWeekly,
      validFrom: c.validFrom,
      validTo: c.validTo,
      active: c.active !== false,
    };
  });

  const activeCount = displayContracts.filter((c) => c.active).length;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Contracts</h1>
            <p className={styles.pageSubtitle}>
              {displayContracts.length} total · {activeCount} active
            </p>
          </div>
        </div>

        <ContractsClient
          contracts={displayContracts}
          offices={offices}
          services={services}
        />
      </div>
    </AppShell>
  );
}
