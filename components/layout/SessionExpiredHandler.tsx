'use client';

// Rendered by the root layout when a valid JWT is detected but the DB
// sessionToken no longer matches (e.g., the user logged in from another
// device and this session was invalidated).
// On mount, immediately signs the user out and redirects to /login.

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export default function SessionExpiredHandler() {
  useEffect(() => {
    signOut({ callbackUrl: `${window.location.origin}/login` });
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      color: '#555',
    }}>
      <p>Your session has expired or was replaced by a new login.</p>
      <p>Redirecting to login…</p>
    </div>
  );
}
