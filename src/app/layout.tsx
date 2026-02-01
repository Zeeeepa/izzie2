import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmModalProvider } from '@/components/ui/confirm-modal';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Izzie - AI Personal Assistant',
  description: 'Intelligent personal assistant powered by AI',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <ToastProvider>
          <ConfirmModalProvider>
            {children}
          </ConfirmModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
