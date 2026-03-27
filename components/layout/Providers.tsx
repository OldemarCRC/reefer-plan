'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import InactivityTimer from './InactivityTimer';
import { SidebarProvider, type FleetStatus, type PortTemp } from './SidebarContext';

interface ProvidersProps {
  children: React.ReactNode;
  // Pre-resolved session from the server layout.
  // Passed to SessionProvider so useSession() returns data immediately
  // on the first render, avoiding the loading-state '?' flash in the avatar.
  session: Session | null;
  fleetStatus: FleetStatus | null;
  portTemps: PortTemp[];
}

export default function Providers({ children, session, fleetStatus, portTemps }: ProvidersProps) {
  return (
    <SessionProvider key={session?.user?.id ?? 'guest'} session={session} refetchInterval={30} refetchOnWindowFocus={true}>
      <SidebarProvider fleetStatus={fleetStatus} portTemps={portTemps}>
        <InactivityTimer />
        {children}
      </SidebarProvider>
    </SessionProvider>
  );
}
