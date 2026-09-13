import type { Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './resizable.css';
import ApplicationEnvGuard from '@/components/ApplicationEnvGuard';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import AppLayout from '@/components/AppLayout';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
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
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ApplicationEnvGuard>
          <AuthProvider>
            <LanguageProvider>
              <PermissionsProvider>
                <AppLayout>{children}</AppLayout>
              </PermissionsProvider>
            </LanguageProvider>
          </AuthProvider>
        </ApplicationEnvGuard>
      </body>
    </html>
  );
}
