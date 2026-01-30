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
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
