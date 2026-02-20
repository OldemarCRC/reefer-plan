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
      await UserModel.findByIdAndUpdate(session.user.id, {
        isOnline: false,
        sessionToken: null,
      });
    } else {
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
