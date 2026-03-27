'use client';

import { createContext, useContext } from 'react';

export interface PortTemp {
  code: string;
  label: string;
  country: string;
  temp: number | null;
}

export interface FleetStatus {
  inTransit: number;
  planned: number;
}

interface SidebarData {
  fleetStatus: FleetStatus | null;
  portTemps: PortTemp[];
}

const SidebarContext = createContext<SidebarData>({ fleetStatus: null, portTemps: [] });

export function SidebarProvider({
  children,
  fleetStatus,
  portTemps,
}: {
  children: React.ReactNode;
  fleetStatus: FleetStatus | null;
  portTemps: PortTemp[];
}) {
  return (
    <SidebarContext.Provider value={{ fleetStatus, portTemps }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarData(): SidebarData {
  return useContext(SidebarContext);
}
