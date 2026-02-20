// GET /api/auth/force-signout
//
// Route Handler for server-side session invalidation.
// This MUST be a Route Handler (not a Server Component) because Next.js only
// allows cookies to be written in Route Handlers and Server Actions.
// Calling signOut() from a Server Component renders the cookie-clearing a
// no-op, leaving the JWT cookie intact and causing an infinite redirect loop.
//
// Flow: layout detects stale sessionToken → redirect here → clear DB +
// clear cookie → redirect to /login (no more JWT → middleware allows /login).

import { auth, signOut } from '@/auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function GET() {
  const session = await auth();

  if (session?.user?.id) {
    try {
      await connectDB();
      await UserModel.findByIdAndUpdate(session.user.id, {
        isOnline: false,
        sessionToken: null,
      });
    } catch (err) {
      console.error('[force-signout] DB cleanup error:', err);
    }
  }

  // signOut clears the JWT cookie (works here because Route Handlers CAN
  // set cookies) and calls redirect('/login') — throws NEXT_REDIRECT.
  await signOut({ redirectTo: '/login' });
}
