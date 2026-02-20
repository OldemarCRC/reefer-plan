'use client';

// Mounted inside SessionProvider so it can read the session.
// Only activates tracking when the user is authenticated.

import { useSession } from 'next-auth/react';
import { useActivityTracker } from '@/hooks/useActivityTracker';

export default function ActivityTracker() {
  const { data: session } = useSession();
  useActivityTracker(!!session?.user);
  return null;
}
