/**
 * Better Auth Client
 * Client-side authentication utilities and hooks for React components
 */

'use client';

import { createAuthClient } from 'better-auth/react';
import type { AuthSession } from './index';

/**
 * Auth client for client-side operations
 * Provides methods for sign-in, sign-out, and session management
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',
});

/**
 * Re-export hooks for convenience
 */
export const { useSession, signIn, signOut } = authClient;

/**
 * Helper to sign in with Google
 * Redirects to Google OAuth consent screen
 */
export function signInWithGoogle() {
  return signIn.social({
    provider: 'google',
    callbackURL: '/dashboard', // Redirect to dashboard after sign-in
  });
}

/**
 * Helper to sign in with GitHub
 * Redirects to GitHub OAuth consent screen
 */
export function signInWithGitHub() {
  return signIn.social({
    provider: 'github',
    callbackURL: '/dashboard', // Redirect to dashboard after sign-in
  });
}

/**
 * Helper to sign out
 * Clears session and redirects to home
 */
export function handleSignOut() {
  return signOut();
}

/**
 * Helper to link an additional Google account
 * Links a new Google account to the existing user
 * Uses Better Auth's linkSocial method which calls /link-social endpoint
 * @param callbackURL - Where to redirect after linking (defaults to accounts settings)
 */
export async function linkGoogleAccount(callbackURL: string = '/dashboard/settings/accounts') {
  // Use the authClient's linkSocial method - this calls POST /api/auth/link-social
  // The method is auto-generated from the Better Auth /link-social endpoint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = authClient as any;

  if (typeof client.linkSocial === 'function') {
    return client.linkSocial({
      provider: 'google',
      callbackURL,
    });
  }

  // Fallback: Use $fetch to call the endpoint directly
  const response = await client.$fetch('/link-social', {
    method: 'POST',
    body: {
      provider: 'google',
      callbackURL,
    },
  });

  // If the response contains a redirect URL, navigate to it
  if (response?.data?.url) {
    window.location.href = response.data.url;
  }

  return response;
}

/**
 * Helper to link an additional GitHub account
 * Links a new GitHub account to the existing user
 * Uses Better Auth's linkSocial method which calls /link-social endpoint
 * @param callbackURL - Where to redirect after linking (defaults to accounts settings)
 */
export async function linkGitHubAccount(callbackURL: string = '/dashboard/settings/accounts') {
  // Use the authClient's linkSocial method - this calls POST /api/auth/link-social
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = authClient as any;

  if (typeof client.linkSocial === 'function') {
    return client.linkSocial({
      provider: 'github',
      callbackURL,
    });
  }

  // Fallback: Use $fetch to call the endpoint directly
  const response = await client.$fetch('/link-social', {
    method: 'POST',
    body: {
      provider: 'github',
      callbackURL,
    },
  });

  // If the response contains a redirect URL, navigate to it
  if (response?.data?.url) {
    window.location.href = response.data.url;
  }

  return response;
}

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticated(
  session: AuthSession | null | undefined
): session is AuthSession {
  return session !== null && session !== undefined;
}

/**
 * Hook to require authentication
 * Redirects to sign-in if not authenticated
 */
export function useRequireAuth() {
  const session = useSession();

  if (!session.data && !session.isPending) {
    // Not authenticated and not loading - redirect to sign-in
    signInWithGoogle();
  }

  return session;
}
