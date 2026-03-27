import { auth } from '@/auth';
import AppShell from '@/components/layout/AppShell';
import { getActiveServices } from '@/app/actions/service';
import NewVoyageWizard from './NewVoyageWizard';

export default async function NewVoyagePage() {
  const session = await auth();
  const serviceFilter = (session?.user as any)?.serviceFilter ?? [];

  const result = await getActiveServices();
  const allServices = result.success ? (result.data ?? []) : [];

  const visibleServices = serviceFilter.length === 0
    ? allServices
    : allServices.filter((s: any) => serviceFilter.includes(s.serviceCode));

  return (
    <AppShell>
      <NewVoyageWizard initialServices={visibleServices} />
    </AppShell>
  );
}
