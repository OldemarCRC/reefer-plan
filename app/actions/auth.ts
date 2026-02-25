'use server';

import { signIn, signOut, auth } from '@/auth';
import { AuthError } from 'next-auth';
import connectDB from '@/lib/db/connect';
import { UserModel } from '@/lib/db/schemas';

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    // Look up the user's role to determine the correct post-login destination.
    // This avoids a double-redirect (signIn → '/' → middleware → '/shipper')
    // that causes a client-side crash for EXPORTER accounts.
    const email = (formData.get('email') as string | null)?.toLowerCase() ?? '';
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
        case 'CredentialsSignin':
          return { error: 'Invalid email or password.' };
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
