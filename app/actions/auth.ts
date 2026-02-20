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
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
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
      await connectDB();
      await UserModel.findByIdAndUpdate(session.user.id, {
        isOnline: false,
        sessionToken: null,
      });
    }
  } catch (err) {
    console.error('[auth] logout DB update error:', err);
  }
  await signOut({ redirectTo: '/login' });
}
