import NextAuth from 'next-auth';
import authConfig from './auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Use the edge-safe config (no Mongoose/bcrypt) for middleware.
// The jwt callback in auth.config.ts enforces the hard 8-hour loginAt check;
// if it returns null, req.auth will be null here, and we redirect + clear the cookie.
const { auth } = NextAuth(authConfig);

// Build a redirect-to-login response that also deletes the session cookies.
function redirectToLogin(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.delete('authjs.session-token');
  res.cookies.delete('__Secure-authjs.session-token');
  return res;
}

// Validate the token's sessionVersion against the DB via an internal API route.
// Returns true if the session is still current, false if it has been superseded
// by a newer login on another device.
async function checkSessionVersion(req: NextRequest, userId: string, tokenVersion: number): Promise<boolean> {
  try {
    const checkUrl = new URL('/api/auth/check-session', req.nextUrl.origin);
    checkUrl.searchParams.set('uid', userId);
    checkUrl.searchParams.set('v', String(tokenVersion));

    const res = await fetch(checkUrl.toString(), {
      headers: { 'x-check-session-secret': process.env.NEXTAUTH_SECRET ?? '' },
      // Short timeout so a slow DB doesn't block every request.
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return true; // fail open on non-2xx
    const data = await res.json();
    return data.valid === true;
  } catch {
    // Network error or timeout — fail open so a DB hiccup doesn't lock out everyone.
    return true;
  }
}

export default auth(async function onRequest(req) {
  const session    = req.auth;
  const isLoggedIn = !!session?.user;
  const role       = (session?.user as any)?.role as string | undefined;
  const { pathname } = req.nextUrl;

  // Public: account confirmation — no auth required.
  if (pathname.startsWith('/confirm')) return NextResponse.next();

  // Session is null (never logged in, or jwt callback returned null = expired).
  // Redirect to login and clear both HTTP and HTTPS cookie variants.
  if (!isLoggedIn) {
    if (pathname === '/login') return NextResponse.next();
    return redirectToLogin(req);
  }

  // Logged-in user visiting the login page → redirect to the right home.
  if (pathname === '/login') {
    if (role === 'EXPORTER') return NextResponse.redirect(new URL('/shipper', req.url));
    return NextResponse.redirect(new URL('/', req.url));
  }

  // sessionVersion check: compare the value in the JWT against the DB to detect
  // concurrent logins. A new login increments the DB counter, making the old
  // token's version stale — that browser is then redirected to login.
  const userId       = (session?.user as any)?.id as string | undefined;
  const tokenVersion = (session?.user as any)?.sessionVersion as number | undefined;

  if (userId && tokenVersion !== undefined) {
    const valid = await checkSessionVersion(req, userId, tokenVersion);
    if (!valid) return redirectToLogin(req);
  }

  // Shipper portal: EXPORTER role only.
  if (pathname.startsWith('/shipper')) {
    if (role !== 'EXPORTER') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  // EXPORTERs are limited to /shipper/* and /account.
  if (role === 'EXPORTER') {
    if (pathname === '/account') return NextResponse.next();
    return NextResponse.redirect(new URL('/shipper', req.url));
  }

  // Admin-only routes.
  if (pathname.startsWith('/admin') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Stevedore: read-only access to a limited set of routes.
  if (role === 'STEVEDORE') {
    const allowed =
      pathname === '/' ||
      pathname === '/voyages' ||
      pathname === '/stowage-plans' ||
      (pathname.startsWith('/stowage-plans/') && !pathname.startsWith('/stowage-plans/new'));

    if (!allowed) return NextResponse.redirect(new URL('/stowage-plans', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Protect all routes except NextAuth API routes, static files, and favicons.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
