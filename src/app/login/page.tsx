import { redirect } from 'next/navigation';

/**
 * Login Page - Redirects to root page which now handles login
 */
export default function LoginPage() {
  redirect('/');
}
