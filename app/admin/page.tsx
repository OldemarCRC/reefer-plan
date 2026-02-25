import AppShell from '@/components/layout/AppShell';
import { getAdminVoyages } from '@/app/actions/voyage';
import { getContracts } from '@/app/actions/contract';
import { getActiveOffices } from '@/app/actions/office';
import { getServices } from '@/app/actions/service';
import { getAdminPlans } from '@/app/actions/stowage-plan';
import { getAdminVessels } from '@/app/actions/vessel';
import { getUsers } from '@/app/actions/user';
import { getPorts } from '@/app/actions/port';
import { getShippers } from '@/app/actions/shipper';
import AdminClient from './AdminClient';
import type { DisplayContract } from '@/app/contracts/ContractsClient';

export const metadata = { title: 'Admin — Reefer Planner' };

export default async function AdminPage() {
  const [voyagesResult, contractsRes, officesRes, servicesRes, plansRes, vesselsRes, usersRes, portsRes, shippersRes] = await Promise.all([
    getAdminVoyages(),
    getContracts(),
    getActiveOffices(),
    getServices(),
    getAdminPlans(),
    getAdminVessels(),
    getUsers(),
    getPorts(),
    getShippers(),
  ]);

  const voyages = voyagesResult.success ? voyagesResult.data : [];
  const contracts = contractsRes.success ? contractsRes.data : [];
  const offices = officesRes.success ? officesRes.data : [];
  const services = servicesRes.success ? servicesRes.data : [];
  const plans = plansRes.success ? plansRes.data : [];
  const vessels = vesselsRes.success ? vesselsRes.data : [];
  const users = usersRes.success ? usersRes.data : [];
  const ports = portsRes.success ? portsRes.data : [];
  const shippers = shippersRes.success ? shippersRes.data : [];

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

  return (
    <AppShell>
      <AdminClient
        voyages={voyages}
        contracts={displayContracts}
        offices={offices}
        services={services}
        plans={plans}
        vessels={vessels}
        users={users}
        ports={ports}
        shippers={shippers}
      />
    </AppShell>
  );
}
