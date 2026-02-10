import { getVoyages } from '@/app/actions/voyage';
import StowagePlanWizard from './StowagePlanWizard';
import type { WizardVoyage } from './StowagePlanWizard';

const ACTIVE_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS'];

export default async function NewStowagePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ voyageId?: string }>;
}) {
  const { voyageId } = await searchParams;

  const result = await getVoyages();
  const raw = result.success ? result.data : [];

  const voyages: WizardVoyage[] = raw
    .filter((v: any) => ACTIVE_STATUSES.includes(v.status))
    .map((v: any) => ({
      _id: v._id,
      voyageNumber: v.voyageNumber,
      vesselName: v.vesselName,
      startDate: v.departureDate
        ? new Date(v.departureDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'TBD',
      status: v.status,
      portCalls: (v.portCalls || [])
        .slice()
        .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((pc: any) => ({ portName: pc.portName, sequence: pc.sequence ?? 0 })),
    }));

  return (
    <StowagePlanWizard
      voyages={voyages}
      initialVoyageId={voyageId ?? null}
    />
  );
}
