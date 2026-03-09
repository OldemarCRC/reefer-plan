import AppShell from '@/components/layout/AppShell';
import { getAdminVoyages } from '@/app/actions/voyage';
import { getContracts } from '@/app/actions/contract';
import { getOffices } from '@/app/actions/office';
import { getServices } from '@/app/actions/service';
import { getAdminPlans } from '@/app/actions/stowage-plan';
import { getAdminVessels } from '@/app/actions/vessel';
import { getUsers } from '@/app/actions/user';
import { getPorts, getUnecePorts } from '@/app/actions/port';
import { getShippers } from '@/app/actions/shipper';
import { getAdminBookings } from '@/app/actions/booking';
import AdminClient from './AdminClient';
import type { DisplayContract } from '@/app/contracts/ContractsClient';

export const metadata = { title: 'Admin — Reefer Planner' };

export default async function AdminPage() {
  const [voyagesResult, contractsRes, officesRes, servicesRes, plansRes, vesselsRes, usersRes, portsRes, shippersRes, unecePortsRes, bookingsRes] = await Promise.all([
    getAdminVoyages(),
    getContracts(),
    getOffices(),
    getServices(),
    getAdminPlans(),
    getAdminVessels(),
    getUsers(),
    getPorts(),
    getShippers(),
    getUnecePorts(),
    getAdminBookings(),
  ]);

  const voyages  = voyagesResult.success ? voyagesResult.data : [];
  const contracts = contractsRes.success ? contractsRes.data : [];
  const offices  = officesRes.success   ? officesRes.data   : [];
  const services = servicesRes.success  ? servicesRes.data  : [];
  const plans    = plansRes.success     ? plansRes.data     : [];
  const vessels  = vesselsRes.success   ? vesselsRes.data   : [];
  const users    = usersRes.success     ? usersRes.data     : [];
  const ports    = portsRes.success     ? portsRes.data     : [];
  const shippers   = shippersRes.success   ? shippersRes.data   : [];
  const unecePorts = unecePortsRes.success ? unecePortsRes.data : [];
  const bookings   = bookingsRes.success   ? bookingsRes.data   : [];

  const displayContracts: DisplayContract[] = contracts.map((c: any) => {
    const legacyCps = c.client?.type === 'SHIPPER' ? c.consignees : c.shippers;
    const totalWeekly = (legacyCps || []).reduce(
      (sum: number, cp: any) => sum + (cp.weeklyEstimate || 0),
      0
    );
    return {
      _id: c._id,
      contractNumber: c.contractNumber,
      clientName: c.client?.name || 'Unknown',
      clientType: c.client?.type || 'SHIPPER',
      clientContact: c.client?.contact || '',
      clientEmail: c.client?.email || '',
      clientCountry: c.client?.country || '',
      officeCode: c.officeCode || c.officeId?.code || '—',
      officeId: c.officeId?._id || c.officeId || '',
      serviceCode: c.serviceCode || c.serviceId?.serviceCode || '—',
      serviceName: c.serviceId?.serviceName || '—',
      serviceId: c.serviceId?._id || c.serviceId || '',
      originPort: c.originPort?.portCode || '—',
      originPortName: c.originPort?.portName || '',
      originPortCountry: c.originPort?.country || '',
      destinationPort: c.destinationPort?.portCode || '—',
      destinationPortName: c.destinationPort?.portName || '',
      destinationPortCountry: c.destinationPort?.country || '',
      cargoType: c.cargoType || '',
      weeklyPallets: c.weeklyPallets || 0,
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
        unecePorts={unecePorts}
        bookings={bookings}
      />
    </AppShell>
  );
}
