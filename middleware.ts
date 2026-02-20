import NextAuth from 'next-auth';
import authConfig from './auth.config';

// Use edge-safe config (no Mongoose/bcrypt) for middleware.
// Next.js 15+ requires a default export for the middleware function.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect all routes except NextAuth API routes, static files, and login
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
