import { getVoyagesForPlanWizard } from '@/app/actions/voyage';
import StowagePlanWizard from './StowagePlanWizard';
import type { WizardVoyage } from './StowagePlanWizard';

export default async function NewStowagePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ voyageId?: string }>;
}) {
  const { voyageId } = await searchParams;

  const result = await getVoyagesForPlanWizard();
  const raw = result.success ? result.data : [];

  const voyages: WizardVoyage[] = raw.map((v: any) => {
    const vessel = v.vesselId as any;
    return {
      _id: v._id,
      voyageNumber: v.voyageNumber,
      vesselName: vessel?.name ?? v.vesselName ?? 'Unknown vessel',
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
      vesselZones: (vessel?.temperatureZones ?? []).map((z: any) => ({
        zoneId: z.zoneId,
        coolingSections: (z.coolingSections ?? []).map((s: any) => ({
          sectionId: s.sectionId,
        })),
      })),
    };
  });

  return (
    <StowagePlanWizard
      voyages={voyages}
      initialVoyageId={voyageId ?? null}
    />
  );
}
