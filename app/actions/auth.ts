'use server';

import { signIn, signOut, auth } from '@/auth';
import { AuthError } from 'next-auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

// ---------------------------------------------------------------------------
// In-memory rate limiter — 5 failed attempts per 15-minute window per email.
// Resets automatically when the window expires.
// ---------------------------------------------------------------------------
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= RATE_LIMIT_MAX;
}

function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(email, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count++;
  }
}

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    // Look up the user's role to determine the correct post-login destination.
    // This avoids a double-redirect (signIn → '/' → middleware → '/shipper')
    // that causes a client-side crash for EXPORTER accounts.
    const email = (formData.get('email') as string | null)?.toLowerCase() ?? '';

    // Rate-limit check before hitting the DB or bcrypt
    if (email && isRateLimited(email)) {
      return { error: 'Too many login attempts. Please try again in 15 minutes.' };
    }

    let redirectTo = '/';
    if (email) {
      await connectDB();
      const user = await UserModel.findOne({ email }).select('role').lean();
      if (user && (user as any).role === 'EXPORTER') {
        redirectTo = '/shipper';
      }
    }

    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin': {
          const email = (formData.get('email') as string | null)?.toLowerCase() ?? '';
          if (email) recordFailedAttempt(email);
          return { error: 'Invalid email or password.' };
        }
        default:
          return { error: 'An error occurred. Please try again.' };
      }
    }
    throw error; // re-throw NEXT_REDIRECT so Next.js handles the redirect
  }
  return { error: null };
}

export async function logoutAction() {
  try {
    const session = await auth();
    if (session?.user?.id) {
      // Increment sessionVersion so any other open sessions are invalidated
      await connectDB();
      await UserModel.findByIdAndUpdate(session.user.id, { $inc: { sessionVersion: 1 } });
    }
  } catch (err) {
    console.error('[auth] logout error:', err);
  }
  await signOut({ redirectTo: '/login' });
}
