import ShipperShell from '@/components/layout/ShipperShell';

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  return <ShipperShell>{children}</ShipperShell>;
}
