'use client';

import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useInactivitySignOut } from '@/hooks/useInactivitySignOut';

// Signs the user out after 15 minutes of inactivity.
// Also handles server-initiated session invalidation: when the Node.js jwt
// callback in auth.ts detects a sessionVersion mismatch (concurrent login on
// another device), it returns null, which clears the session cookie and causes
// SessionProvider to report 'unauthenticated'. This effect catches that
// transition and redirects to /login immediately on the same page load.
export default function InactivityTimer() {
  const { data: session, status } = useSession();
  const prevStatusRef = useRef<string | undefined>(undefined);

  useInactivitySignOut(!!session?.user);

  useEffect(() => {
    // Only redirect when transitioning FROM 'authenticated' TO 'unauthenticated'.
    // Ignores initial page load where status goes 'loading' → 'unauthenticated'
    // (e.g. an already-expired session on /login) — prevStatusRef would be
    // 'loading', not 'authenticated', so the redirect does not fire.
    if (prevStatusRef.current === 'authenticated' && status === 'unauthenticated') {
      signOut({ redirect: false }).then(() => {
        window.location.replace('/login');
      });
    }
    prevStatusRef.current = status;
  }, [status]);

  return null;
}
