import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'HFC Deacon Board',
    template: '%s · HFC Deacon Board',
  },
  description: 'Motions, votes and meetings for the Harrison Faith Church Deacon Board.',
  applicationName: 'HFC Board',
  appleWebApp: {
    capable: true,
    title: 'HFC Board',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#1f4fbf',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="bg-page text-ink flex min-h-full flex-col">{children}</body>
    </html>
  );
}
