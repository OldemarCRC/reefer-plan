'use client';

import { useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function useInactivitySignOut(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        signOut({ callbackUrl: '/login' });
      }, INACTIVITY_TIMEOUT);
    };

    reset(); // start timer immediately

    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (timer.current) clearTimeout(timer.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [enabled]);
}
