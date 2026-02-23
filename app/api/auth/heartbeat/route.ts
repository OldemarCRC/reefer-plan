// POST /api/auth/heartbeat
// Updates lastActivity for the authenticated user.
// Called every 5 minutes by the client-side ActivityTracker.
// Also handles the beforeunload beacon (logout=true query param).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    const isLogout = req.nextUrl.searchParams.get('logout') === 'true';

    if (isLogout) {
      // beforeunload beacon: mark user offline only.
      // Do NOT clear sessionToken here — beforeunload fires on page refresh
      // too, and clearing it would log the user out every time they refresh.
      // sessionToken is only cleared by an explicit logoutAction().
      await UserModel.findByIdAndUpdate(session.user.id, {
        isOnline: false,
      });
    } else {
      // Regular heartbeat: validate that this JWT's sessionToken still matches
      // the DB. If a newer login replaced this session, tell the client to
      // sign out (proactive single-session enforcement, max 5-min lag).
      const jwtToken = (session.user as any).sessionToken as string | undefined;
      if (jwtToken) {
        const user = await UserModel
          .findById(session.user.id)
          .select('+sessionToken')
          .lean();

        if (!user || (user as any).sessionToken !== jwtToken) {
          return NextResponse.json({ error: 'session_replaced' }, { status: 401 });
        }
      }

      await UserModel.findByIdAndUpdate(session.user.id, {
        lastActivity: new Date(),
        isOnline: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[heartbeat] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
