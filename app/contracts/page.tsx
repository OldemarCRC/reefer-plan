import AppShell from '@/components/layout/AppShell';
import { getContracts } from '@/app/actions/contract';
import { getActiveOffices } from '@/app/actions/office';
import { getServices } from '@/app/actions/service';
import { getActiveShippers } from '@/app/actions/shipper';
import ContractsClient from './ContractsClient';
import type { DisplayContract } from './ContractsClient';

export const metadata = { title: 'Contracts — Reefer Planner' };

export default async function ContractsPage() {
  const [contractsRes, officesRes, servicesRes, shippersRes] = await Promise.all([
    getContracts(),
    getActiveOffices(),
    getServices(),
    getActiveShippers(),
  ]);

  const contracts = (contractsRes.success ? contractsRes.data : []) as DisplayContract[];
  const offices   = (officesRes.success   ? officesRes.data   : []) as any[];
  const services  = (servicesRes.success  ? servicesRes.data  : []) as any[];
  const shippers  = (shippersRes.success  ? shippersRes.data  : []) as any[];

  return (
    <AppShell>
      <ContractsClient
        contracts={contracts}
        offices={offices}
        services={services}
        shippers={shippers}
      />
    </AppShell>
  );
}
