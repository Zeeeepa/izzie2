/**
 * Dashboard Home Page
 * Mobile-first proactive card view
 */

'use client';

import { useSession } from '@/lib/auth/client';
import { ProactiveCard } from '@/components/dashboard/ProactiveCard';

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  // TODO: Replace with real data from API
  const todayEvents = [
    { id: 1, title: 'Team standup', subtitle: 'Daily sync', time: '9:00 AM' },
    { id: 2, title: 'Project review', subtitle: 'Q1 planning', time: '2:00 PM' },
  ];

  const dueTasks = [
    { id: 1, title: 'Review proposal', subtitle: 'Project X' },
    { id: 2, title: 'Send follow-up email', subtitle: 'Client meeting' },
  ];

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
        <h2 className="text-2xl font-bold">
          Hi, {firstName}
        </h2>
        <p className="text-muted-foreground">Here&apos;s your day at a glance</p>
      </div>

      {/* Today's Events */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          Today&apos;s Events
        </h3>
        <div className="space-y-2">
          {todayEvents.map((event) => (
            <ProactiveCard
              key={event.id}
              type="event"
              title={event.title}
              subtitle={event.subtitle}
              time={event.time}
            />
          ))}
        </div>
      </section>

      {/* Due Tasks */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          Due Today
        </h3>
        <div className="space-y-2">
          {dueTasks.map((task) => (
            <ProactiveCard
              key={task.id}
              type="task"
              title={task.title}
              subtitle={task.subtitle}
            />
          ))}
        </div>
      </section>

      {/* Quick Chat Input Placeholder */}
      <section className="fixed bottom-20 left-4 right-4">
        <div className="rounded-full border bg-muted/50 px-4 py-3 text-muted-foreground">
          Ask me anything...
        </div>
      </section>
    </div>
  );
}
