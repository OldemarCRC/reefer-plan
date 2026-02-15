import AppShell from '@/components/layout/AppShell';
import { getAdminVoyages } from '@/app/actions/voyage';
import AdminClient from './AdminClient';

export const metadata = { title: 'Admin — Reefer Planner' };

export default async function AdminPage() {
  const voyagesResult = await getAdminVoyages();
  const voyages = voyagesResult.success ? voyagesResult.data : [];

  return (
    <AppShell>
      <AdminClient voyages={voyages} />
    </AppShell>
  );
}
