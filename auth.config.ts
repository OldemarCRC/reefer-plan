import type { NextAuthConfig } from 'next-auth';

export default {
  providers: [], // Credentials provider added in auth.ts (Node.js only)

  pages: {
    signIn: '/login',
  },

  callbacks: {
    // Fix Docker/LAN redirect issue: strip the base URL from redirect targets
    // so NEXTAUTH_URL=localhost:3000 doesn't corrupt redirects on 192.168.x.x:3001
    redirect({ url }) {
      if (url.startsWith('/')) return url;
      try {
        const { pathname, search } = new URL(url);
        return pathname + search;
      } catch {
        return '/';
      }
    },

    // Called on every request in middleware to decide if it's authorized
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as any)?.role as string | undefined;
      const { pathname } = nextUrl;

      // Login page: redirect to dashboard if already authenticated
      if (pathname === '/login') {
        if (isLoggedIn) {
          // EXPORTERs go to shipper portal
          if (role === 'EXPORTER') return Response.redirect(new URL('/shipper', nextUrl));
          return Response.redirect(new URL('/', nextUrl));
        }
        return true;
      }

      // Account confirmation page: public, no auth required
      if (pathname.startsWith('/confirm')) return true;

      // All other routes require authentication
      if (!isLoggedIn) return false; // NextAuth redirects to pages.signIn

      // Shipper portal: EXPORTER only
      if (pathname.startsWith('/shipper')) {
        if (role !== 'EXPORTER') {
          return Response.redirect(new URL('/', nextUrl));
        }
        return true;
      }

      // EXPORTERs can only access /shipper/* and /account
      if (role === 'EXPORTER') {
        if (pathname === '/account') return true;
        return Response.redirect(new URL('/shipper', nextUrl));
      }

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
        (session.user as any).role           = token.role;
        (session.user as any).id             = token.sub;
        (session.user as any).shipperCode    = token.shipperCode ?? null;
        (session.user as any).sessionVersion = token.sessionVersion;
      }
      return session;
    },
  },

  trustHost: true,
} satisfies NextAuthConfig;
