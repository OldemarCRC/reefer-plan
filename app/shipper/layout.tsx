import { auth } from '@/auth';
import { getShipperById } from '@/app/actions/shipper';
import ShipperShell from '@/components/layout/ShipperShell';

export default async function ShipperLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const shipperId = (session?.user as any)?.shipperId as string | null | undefined;

  let shipperName: string | undefined;
  if (shipperId) {
    const result = await getShipperById(shipperId);
    if (result.success) shipperName = result.data?.name;
  }

  return <ShipperShell shipperName={shipperName}>{children}</ShipperShell>;
}
