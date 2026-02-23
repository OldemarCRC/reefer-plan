'use client';

// Tracks user activity (mouse, keyboard, scroll, touch).
// Every HEARTBEAT_INTERVAL it pings /api/auth/heartbeat to update lastActivity in DB.
// If no activity is detected for INACTIVITY_TIMEOUT, the user is automatically signed out.
// A beforeunload listener also notifies the server so isOnline is cleared promptly.

import { useEffect, useRef, useCallback } from 'react';
import { signOut } from 'next-auth/react';

const HEARTBEAT_INTERVAL = 5 * 60 * 1000;   // 5 minutes
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;  // 15 minutes

export function useActivityTracker(enabled: boolean) {
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      console.log('[activity] Inactivity timeout — signing out');
      signOut({ callbackUrl: `${window.location.origin}/login` });
    }, INACTIVITY_TIMEOUT);
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/heartbeat', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'session_replaced') {
          // Another login replaced this session. Sign out immediately.
          console.log('[activity] session replaced — signing out');
          signOut({ callbackUrl: `${window.location.origin}/login` });
        }
      }
    } catch {
      // Network errors are silently ignored; cleanup job handles stale sessions
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart'] as const;

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, resetInactivityTimer, { passive: true })
    );

    // Start inactivity timer and heartbeat interval
    resetInactivityTimer();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Best-effort logout on tab/browser close (sendBeacon is reliable even on unload)
    const handleBeforeUnload = () => {
      navigator.sendBeacon('/api/auth/heartbeat?logout=true');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, resetInactivityTimer)
      );
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (heartbeatTimerRef.current)  clearInterval(heartbeatTimerRef.current);
    };
  }, [enabled, resetInactivityTimer, sendHeartbeat]);
}
