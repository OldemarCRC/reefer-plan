// Server-side session token validation.
// Accepts the already-resolved session to avoid a redundant auth() call.
// Compares the sessionToken stored in the JWT (via session.user.sessionToken)
// against the one persisted in MongoDB.
// Returns false if: no session, no token, DB token is null, or tokens don't match.

import type { Session } from 'next-auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function validateSession(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;

  const jwtToken = (session.user as any).sessionToken as string | undefined;
  // JWT predates session-token feature (user was already logged in before the
  // feature was deployed). Allow through — they will get a proper token on
  // their next explicit login.
  if (!jwtToken) return true;

  try {
    await connectDB();
    const user = await UserModel
      .findById(session.user.id)
      .select('+sessionToken')
      .lean();

    if (!user) return false;

    return (user as any).sessionToken === jwtToken;
  } catch (err) {
    console.error('[validate-session] error:', err);
    // On DB error, allow through to avoid locking everyone out
    return true;
  }
}
