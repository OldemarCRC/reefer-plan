import type { Session } from 'next-auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function validateSession(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;

  const jwtToken = (session.user as any).sessionToken as string | undefined;

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
    return true;
  }
}
