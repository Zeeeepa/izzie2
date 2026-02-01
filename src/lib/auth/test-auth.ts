/**
 * Test Authentication Bypass Helper
 *
 * Provides a shared helper for test auth bypass, allowing automated tests
 * to authenticate without going through the full OAuth flow.
 *
 * Usage:
 *   const { userId, userName } = await requireAuthWithTestBypass(request);
 *
 * Test headers:
 *   X-Test-Secret: Must match CHAT_TEST_SECRET env var
 *   X-Test-User-Id: The user ID to use for the request
 */

import { requireAuth } from './index';

export interface TestAuthResult {
  userId: string;
  userName: string;
}

/**
 * Authenticate request with optional test bypass
 *
 * If valid test headers are present (X-Test-Secret and X-Test-User-Id),
 * bypasses normal auth and returns the test user.
 * Otherwise, uses normal authentication.
 *
 * @param request - The incoming request
 * @returns userId and userName from either test headers or real auth
 * @throws Error if authentication fails
 */
export async function requireAuthWithTestBypass(
  request: Request
): Promise<TestAuthResult> {
  const testSecret = request.headers.get('X-Test-Secret');
  const expectedTestSecret = process.env.CHAT_TEST_SECRET;
  const testUserId = request.headers.get('X-Test-User-Id');

  // Check for valid test auth bypass
  if (
    testSecret &&
    expectedTestSecret &&
    testSecret === expectedTestSecret &&
    testUserId
  ) {
    return {
      userId: testUserId,
      userName: 'Test User',
    };
  }

  // Fall back to normal auth
  const session = await requireAuth(request);
  return {
    userId: session.user.id,
    userName: session.user.name || 'User',
  };
}
