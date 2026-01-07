/**
 * UserInfo Component
 * Fetches user session and renders AppSidebar
 * This component handles the async auth call inside a Suspense boundary
 */

import { AppSidebar } from '@/components/layout/AppSidebar';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function UserInfo() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Middleware ensures user is authenticated, but provide fallback
  const user = session?.user ?? {
    name: 'Guest',
    email: '',
  };

  return (
    <AppSidebar
      user={{
        name: user.name,
        email: user.email,
      }}
    />
  );
}
