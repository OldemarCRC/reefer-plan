import type { Session } from 'next-auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function validateSession(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;

  const jwtVersion = (session.user as any).sessionVersion as number | undefined;

  // If no sessionVersion in JWT (legacy tokens), allow through
  if (jwtVersion === undefined || jwtVersion === null) return true;

  try {
    await connectDB();
    const user = await UserModel
      .findById(session.user.id)
      .select('sessionVersion')
      .lean();

    if (!user) return false;

    return (user as any).sessionVersion === jwtVersion;
  } catch (err) {
    console.error('[validate-session] error:', err);
    return true;
  }
}
