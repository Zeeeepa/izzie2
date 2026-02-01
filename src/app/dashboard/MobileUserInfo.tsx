/**
 * MobileUserInfo Component
 * Fetches user session and renders MobileHeader
 * This component handles the async auth call inside a Suspense boundary
 *
 * Note: Middleware protects this route, so session should always exist.
 * If somehow session is missing, redirect to login.
 */

import { MobileHeader } from '@/components/layout/MobileHeader';
import { auth } from '@/lib/auth/index';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function MobileUserInfo() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Middleware should have caught this, but double-check as safety measure
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <MobileHeader
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  );
}
