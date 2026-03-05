import NextAuth from 'next-auth';
import authConfig from './auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe auth — uses auth.config.ts only (no Mongoose, no bcrypt).
// The jwt callback in auth.config.ts checks loginAt for the 8-hour hard limit.
// sessionVersion enforcement happens in auth.ts (Node.js runtime) via the async
// jwt callback, which returns null on mismatch and clears the cookie.
const { auth } = NextAuth(authConfig);

// Redirect to /login and clear the session cookie for both HTTP and HTTPS variants.
function redirectToLogin(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.delete('authjs.session-token');
  res.cookies.delete('__Secure-authjs.session-token');
  return res;
}

export default auth(function onRequest(req) {
  const session    = req.auth;
  const isLoggedIn = !!session?.user;
  const role       = (session?.user as any)?.role as string | undefined;
  const { pathname } = req.nextUrl;

  // Public: account confirmation — no auth required.
  if (pathname.startsWith('/confirm')) return NextResponse.next();

  // Session is null (never logged in, loginAt expired, or sessionVersion cleared
  // the cookie on the previous response). Redirect to login.
  if (!isLoggedIn) {
    if (pathname === '/login') return NextResponse.next();
    return redirectToLogin(req);
  }

  // Logged-in user visiting the login page → redirect to the right home.
  if (pathname === '/login') {
    if (role === 'EXPORTER') return NextResponse.redirect(new URL('/shipper', req.url));
    return NextResponse.redirect(new URL('/', req.url));
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
