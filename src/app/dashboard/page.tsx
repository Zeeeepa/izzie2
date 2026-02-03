/**
 * Dashboard Home Page
 * Mobile-first navigation hub
 */

'use client';

import { useSession } from '@/lib/auth/client';
import Link from 'next/link';
import { MessageSquare, Users, GitBranch, Sparkles } from 'lucide-react';

const quickActions = [
  {
    href: '/dashboard/chat',
    icon: MessageSquare,
    label: 'Chat',
    description: 'Talk to Izzie',
    color: 'text-blue-500',
  },
  {
    href: '/dashboard/entities',
    icon: Users,
    label: 'Entities',
    description: 'People, companies, topics',
    color: 'text-green-500',
  },
  {
    href: '/dashboard/relationships',
    icon: GitBranch,
    label: 'Relationships',
    description: 'Connections & context',
    color: 'text-purple-500',
  },
  {
    href: '/dashboard/discover',
    icon: Sparkles,
    label: 'Discover',
    description: 'Find new entities & relationships',
    color: 'text-orange-500',
  },
];

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="py-4 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(' ')[0] || 'there';

  return (
    <div className="py-4 space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold">Hi, {firstName}</h2>
        <p className="text-muted-foreground">What can I help you with?</p>
      </div>

      {/* Quick Actions Grid */}
      <section className="grid grid-cols-2 gap-3">
        {quickActions.map(({ href, icon: Icon, label, description, color }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col p-4 rounded-xl border bg-card hover:bg-accent transition-colors"
          >
            <Icon className={`h-6 w-6 mb-2 ${color}`} />
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </Link>
        ))}
      </section>

      {/* Izzie's Suggestions - populated dynamically */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Izzie&apos;s Suggestions
        </h3>
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-muted-foreground">
          <p className="text-sm">
            Train Izzie on your data to see personalized suggestions here.
          </p>
        </div>
      </section>

      {/* Quick Chat Input */}
      <section className="fixed bottom-20 left-0 right-0 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Link href="/dashboard/chat">
            <div className="rounded-full border bg-muted/50 px-4 py-3 text-muted-foreground cursor-pointer hover:bg-muted transition-colors">
              Ask me anything...
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
