/**
 * Dashboard Layout
 * Mobile-first layout with bottom navigation and simple header
 *
 * Note: Authentication is handled by middleware.ts - this layout assumes user is authenticated
 */

import { MobileHeader } from '@/components/layout/MobileHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { Suspense } from 'react';
import { MobileUserInfo } from './MobileUserInfo';

// Fallback for BottomNav during static generation
function BottomNavFallback() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/50 backdrop-blur-md h-16">
      <div className="flex h-16 items-center justify-around">
        {/* Placeholder skeleton for nav items */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center justify-center gap-1 px-3 py-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-3 w-8 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </nav>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Suspense fallback={<MobileHeader user={{ name: 'Loading...', email: null }} />}>
        <MobileUserInfo />
      </Suspense>
      <main className="flex-1 overflow-auto pb-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <Suspense fallback={<BottomNavFallback />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
