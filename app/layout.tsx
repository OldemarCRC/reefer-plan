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
    // suppressHydrationWarning: the inline script below adds .sidebar-collapsed to <html>
    // before React loads; suppressing the warning avoids a false mismatch complaint.
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <head>
        {/*
          Blocking script — executes synchronously before the browser's first paint.
          Reads localStorage and adds .sidebar-collapsed to <html> immediately,
          so the CSS can collapse the sidebar before React even hydrates.
          Skipped on mobile (≤ 767 px) because those layouts use margin-left: 0.
        */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=window.innerWidth<=767;if(!m&&localStorage.getItem('reefer-sidebar-collapsed')==='true'){document.documentElement.classList.add('sidebar-collapsed');}}catch(e){}})();` }} />
      </head>
      <body>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
