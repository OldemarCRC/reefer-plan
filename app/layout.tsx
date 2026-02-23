import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import Providers from '@/components/layout/Providers';
import SessionExpiredHandler from '@/components/layout/SessionExpiredHandler';
import { auth } from '@/auth';
import { validateSession } from '@/lib/auth/validate-session';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Reefer Stowage Planner',
  description: 'Shore-based stowage planning for refrigerated cargo vessels',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // If the JWT token exists but the DB sessionToken no longer matches (a newer
  // login replaced this session), let the client call signOut() to clear the
  // JWT cookie. The DB is already in the correct state — we must NOT modify it
  // here, because the DB now holds the NEW session's token and clearing it
  // would also invalidate the legitimate replacement session.
  const sessionInvalid =
    !!session?.user?.id && !(await validateSession(session));

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Providers session={sessionInvalid ? null : session}>
          {sessionInvalid ? <SessionExpiredHandler /> : children}
        </Providers>
      </body>
    </html>
  );
}
