import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Game Center · telebirr',
  description: 'Play LEMAT TECHNOLOGY PLC games on the telebirr SuperApp Game Center, earn coins and convert them to ETB.',
  // tab icon: src/app/icon.svg (Next.js picks it up automatically)
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#8dc63f', // telebirr green browser bar on phones
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
