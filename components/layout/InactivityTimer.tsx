'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useInactivitySignOut } from '@/hooks/useInactivitySignOut';

// Routes that don't require authentication — never redirect these.
const PUBLIC_PATHS = ['/login', '/confirm'];

// Signs the user out after 15 minutes of inactivity.
// Also handles server-initiated session invalidation: when the Node.js jwt
// callback in auth.ts detects a sessionVersion mismatch (concurrent login on
// another device), it returns null, which clears the session cookie and causes
// SessionProvider to report 'unauthenticated'. This effect catches that
// transition and redirects to /login immediately on the same page load.
export default function InactivityTimer() {
  const { data: session, status } = useSession();
  const router   = useRouter();
  const pathname = usePathname();

  useInactivitySignOut(!!session?.user);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
    if (!isPublic) {
      router.push('/login');
    }
  }, [status, pathname, router]);

  return null;
}
