'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import ActivityTracker from './ActivityTracker';

interface ProvidersProps {
  children: React.ReactNode;
  // Pre-resolved session from the server layout.
  // Passed to SessionProvider so useSession() returns data immediately
  // on the first render, avoiding the loading-state '?' flash in the avatar.
  session: Session | null;
}

export default function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <ActivityTracker />
      {children}
    </SessionProvider>
  );
}
