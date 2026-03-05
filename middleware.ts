import NextAuth from 'next-auth';
import authConfig from './auth.config';
import { NextResponse } from 'next/server';

// Use the edge-safe config (no Mongoose/bcrypt) for middleware.
// The jwt callback in auth.config.ts enforces the hard 8-hour loginAt check;
// if it returns null, req.auth will be null here, and we redirect + clear the cookie.
const { auth } = NextAuth(authConfig);

export default auth(function onRequest(req) {
  const session  = req.auth;
  const isLoggedIn = !!session?.user;
  const role     = (session?.user as any)?.role as string | undefined;
  const { pathname } = req.nextUrl;

  // Public: account confirmation — no auth required.
  if (pathname.startsWith('/confirm')) return NextResponse.next();

  // Session is null (never logged in, or jwt callback returned null = expired).
  // Redirect to login and clear both HTTP and HTTPS cookie variants.
  if (!isLoggedIn) {
    if (pathname === '/login') return NextResponse.next();
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('authjs.session-token');
    res.cookies.delete('__Secure-authjs.session-token');
    return res;
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
