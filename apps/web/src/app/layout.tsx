import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '@/lib/i18n';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Elder Care & Medication Management',
  description:
    'Accessible medicine management and care circle updates for older adults and family caregivers.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // Allows 200% - 500% zoom without disabling user zoom
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-text-size="normal">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-blue-700 focus:text-white focus:rounded-lg focus:shadow-lg focus:text-lg focus:font-bold"
        >
          Skip to main content
        </a>
        <LanguageProvider>
          <PwaRegister />
          <main id="main-content">{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
