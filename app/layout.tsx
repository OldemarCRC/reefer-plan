import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import Providers from '@/components/layout/Providers';
import { auth } from '@/auth';
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

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
