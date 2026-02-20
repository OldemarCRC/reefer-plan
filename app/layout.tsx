import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import { redirect } from 'next/navigation';
import Providers from '@/components/layout/Providers';
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

  // Detect session invalidated by a newer login elsewhere.
  // We MUST use redirect() here rather than calling signOut() directly,
  // because Next.js does NOT allow cookies to be written from a Server
  // Component. Calling signOut() from here would throw a redirect but leave
  // the JWT cookie intact, causing an infinite redirect loop.
  // The Route Handler at /api/auth/force-signout CAN clear the cookie.
  if (session?.user?.id && !(await validateSession(session))) {
    redirect('/api/auth/force-signout');
    // redirect() returns `never` — TypeScript knows execution stops here.
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        {/*
          Pass the resolved session so SessionProvider has it immediately.
          Without this, useSession() starts as { data: null, status: 'loading' }
          and AppShell renders '?' until the /api/auth/session round-trip
          completes.
        */}
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
