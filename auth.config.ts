// auth.config.ts — Edge-safe NextAuth configuration
// Used by middleware.ts (no Node.js/Mongoose imports allowed)

import type { NextAuthConfig } from 'next-auth';

export default {
  providers: [], // Credentials provider added in auth.ts (Node.js only)

  pages: {
    signIn: '/login',
  },

  callbacks: {
    // Called on every request in middleware to decide if it's authorized
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as any)?.role as string | undefined;
      const { pathname } = nextUrl;

      // Login page: redirect to dashboard if already authenticated
      if (pathname === '/login') {
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
        return true;
      }

      // All other routes require authentication
      if (!isLoggedIn) return false; // NextAuth redirects to pages.signIn

      // Admin-only routes
      if (pathname.startsWith('/admin') && role !== 'ADMIN') {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },

    // Maps JWT token fields onto the session.user object (runs in edge too).
    // In NextAuth v5 the custom session callback replaces the default, so
    // name and email must be mapped explicitly alongside role, id, and sessionToken.
    session({ session, token }) {
      if (session.user) {
        session.user.name  = token.name  ?? null;
        session.user.email = token.email ?? '';
        (session.user as any).role         = token.role;
        (session.user as any).id           = token.sub;
        (session.user as any).sessionToken = token.sessionToken;
      }
      return session;
    },
  },
  // Derive base URL from incoming Host header — works for any IP/port/domain
  // without needing to hardcode NEXTAUTH_URL.
  trustHost: true,
} satisfies NextAuthConfig;
