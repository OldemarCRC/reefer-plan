import AppShell from '@/components/layout/AppShell';
import { getAdminVoyages } from '@/app/actions/voyage';
import { getServices } from '@/app/actions/service';
import { getAdminPlans } from '@/app/actions/stowage-plan';
import { getAdminVessels } from '@/app/actions/vessel';
import { getUsers } from '@/app/actions/user';
import { getPorts } from '@/app/actions/port';
import { getShippers } from '@/app/actions/shipper';
import AdminClient from './AdminClient';

export const metadata = { title: 'Admin — Reefer Planner' };

export default async function AdminPage() {
  const [voyagesResult, servicesRes, plansRes, vesselsRes, usersRes, portsRes, shippersRes] = await Promise.all([
    getAdminVoyages(),
    getServices(),
    getAdminPlans(),
    getAdminVessels(),
    getUsers(),
    getPorts(),
    getShippers(),
  ]);

  const voyages  = voyagesResult.success ? voyagesResult.data : [];
  const services = servicesRes.success  ? servicesRes.data  : [];
  const plans    = plansRes.success     ? plansRes.data     : [];
  const vessels  = vesselsRes.success   ? vesselsRes.data   : [];
  const users    = usersRes.success     ? usersRes.data     : [];
  const ports    = portsRes.success     ? portsRes.data     : [];
  const shippers = shippersRes.success  ? shippersRes.data  : [];

  return (
    <AppShell>
      <AdminClient
        voyages={voyages}
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
