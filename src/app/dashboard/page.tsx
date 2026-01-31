/**
 * Dashboard Home Page
 * Mobile-first proactive view - content populated by Izzie
 */

'use client';

import { useSession } from '@/lib/auth/client';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  // Show skeleton/loading state while session is loading
  if (isPending) {
    return (
      <div className="p-4 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(' ')[0] || 'there';

  return (
    <div className="p-4 space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold">Hi, {firstName}</h2>
        <p className="text-muted-foreground">What can I help you with?</p>
      </div>

      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/chat"
          className="flex flex-col items-center justify-center p-6 rounded-xl border bg-card hover:bg-accent transition-colors"
        >
          <span className="text-3xl mb-2">💬</span>
          <span className="font-medium">Chat</span>
        </Link>
        <Link
          href="/dashboard/train"
          className="flex flex-col items-center justify-center p-6 rounded-xl border bg-card hover:bg-accent transition-colors"
        >
          <span className="text-3xl mb-2">🎓</span>
          <span className="font-medium">Train</span>
        </Link>
        <Link
          href="/dashboard/calendar"
          className="flex flex-col items-center justify-center p-6 rounded-xl border bg-card hover:bg-accent transition-colors"
        >
          <span className="text-3xl mb-2">📅</span>
          <span className="font-medium">Calendar</span>
        </Link>
        <Link
          href="/dashboard/people"
          className="flex flex-col items-center justify-center p-6 rounded-xl border bg-card hover:bg-accent transition-colors"
        >
          <span className="text-3xl mb-2">👥</span>
          <span className="font-medium">People</span>
        </Link>
      </section>

      {/* Proactive Content Area - populated by Izzie */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Izzie&apos;s Suggestions
        </h3>
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-muted-foreground">
          <p className="text-sm">
            Start a conversation or train Izzie to see personalized suggestions here.
          </p>
        </div>
      </section>

      {/* Quick Chat Input Placeholder */}
      <section className="fixed bottom-20 left-4 right-4">
        <Link href="/dashboard/chat">
          <div className="rounded-full border bg-muted/50 px-4 py-3 text-muted-foreground cursor-pointer hover:bg-muted transition-colors">
            Ask me anything...
          </div>
        </Link>
      </section>
    </div>
  );
}
