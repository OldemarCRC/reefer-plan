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

      // Account confirmation page: public, no auth required
      if (pathname.startsWith('/confirm')) return true;

      // All other routes require authentication
      if (!isLoggedIn) return false; // NextAuth redirects to pages.signIn

      // Admin-only routes
      if (pathname.startsWith('/admin') && role !== 'ADMIN') {
        return Response.redirect(new URL('/', nextUrl));
      }

      // Stevedore: allowed routes are / /voyages (list) /stowage-plans (list + detail)
      // Everything else redirects to /stowage-plans
      if (role === 'STEVEDORE') {
        const allowed =
          pathname === '/' ||
          pathname === '/voyages' ||
          pathname === '/stowage-plans' ||
          pathname.startsWith('/stowage-plans/') && !pathname.startsWith('/stowage-plans/new');

        if (!allowed) {
          return Response.redirect(new URL('/stowage-plans', nextUrl));
        }
      }

      return true;
    },

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

  trustHost: true,
} satisfies NextAuthConfig;
