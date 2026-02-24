'use client';

import { useSession } from 'next-auth/react';
import { useInactivitySignOut } from '@/hooks/useInactivitySignOut';

// Signs the user out after 15 minutes of inactivity.
// Mounted inside SessionProvider; no DB calls, no heartbeat.
export default function InactivityTimer() {
  const { data: session } = useSession();
  useInactivitySignOut(!!session?.user);
  return null;
}
