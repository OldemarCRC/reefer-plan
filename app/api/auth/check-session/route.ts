// Internal endpoint called by Edge middleware to validate sessionVersion against the DB.
// Lives under /api/auth/ so the middleware matcher already excludes it from protection.
// Protected by x-check-session-secret header to block external probing.

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function GET(request: Request) {
  // Reject calls that don't carry the shared secret.
  const secret = request.headers.get('x-check-session-secret');
  if (!secret || secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId  = searchParams.get('uid');
  const version = searchParams.get('v');

  if (!userId || version === null) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  try {
    await connectDB();
    const user = await UserModel.findById(userId)
      .select('sessionVersion')
      .lean();

    if (!user) {
      // User deleted — invalidate
      return NextResponse.json({ valid: false });
    }

    const dbVersion    = (user as any).sessionVersion ?? 0;
    const tokenVersion = Number(version);

    return NextResponse.json({ valid: dbVersion === tokenVersion });
  } catch (err) {
    // Fail open: if the DB is unreachable, don't kick everyone out.
    console.error('[check-session] DB error:', err);
    return NextResponse.json({ valid: true });
  }
}
