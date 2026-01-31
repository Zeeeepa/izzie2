/**
 * OAuth Routes
 *
 * Handles Google OAuth flow for the onboarding test harness.
 * This is a simplified OAuth flow that stores tokens in memory for testing.
 */

import { Router, Request, Response } from 'express';
import { google, Auth } from 'googleapis';

const LOG_PREFIX = '[OAuth]';

const router = Router();

// In-memory token storage (for testing only)
let storedTokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} | null = null;

// OAuth2 client (initialized lazily)
let oauth2Client: Auth.OAuth2Client | null = null;

/**
 * Get OAuth2 client instance
 */
function getOAuth2Client(): Auth.OAuth2Client {
  if (!oauth2Client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'http://localhost:3333/oauth/callback';

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
    }

    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Auto-refresh tokens
    oauth2Client.on('tokens', (tokens) => {
      console.log(`${LOG_PREFIX} Tokens refreshed`);
      if (tokens.access_token) {
        storedTokens = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || storedTokens?.refreshToken || '',
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
        };
      }
    });
  }

  return oauth2Client;
}

/**
 * Get authenticated OAuth2 client with tokens
 */
export function getAuthenticatedClient(): Auth.OAuth2Client | null {
  if (!storedTokens) {
    return null;
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: storedTokens.accessToken,
    refresh_token: storedTokens.refreshToken,
    expiry_date: storedTokens.expiresAt.getTime(),
  });

  return client;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return storedTokens !== null;
}

/**
 * Clear stored tokens (logout)
 */
export function clearTokens(): void {
  storedTokens = null;
  console.log(`${LOG_PREFIX} Tokens cleared`);
}

/**
 * GET /oauth/login
 * Redirects to Google OAuth consent screen
 */
router.get('/login', (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Initiating OAuth login`);

  try {
    const client = getOAuth2Client();

    const scopes = [
      // OpenID
      'openid',
      'email',
      'profile',

      // Gmail (read/write)
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',

      // Calendar (read/write)
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',

      // Contacts (read/write)
      'https://www.googleapis.com/auth/contacts',

      // Drive (read/write)
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',

      // Docs (read/write)
      'https://www.googleapis.com/auth/documents',

      // Sheets (read/write)
      'https://www.googleapis.com/auth/spreadsheets',

      // Tasks (read/write)
      'https://www.googleapis.com/auth/tasks',
    ];

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to get refresh token
    });

    res.redirect(authUrl);
  } catch (error) {
    console.error(`${LOG_PREFIX} Login error:`, error);
    res.status(500).json({
      error: 'Failed to initiate OAuth',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /oauth/callback
 * Handles OAuth callback from Google
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    console.error(`${LOG_PREFIX} OAuth error:`, error);
    return res.redirect('/?error=' + encodeURIComponent(String(error)));
  }

  if (!code || typeof code !== 'string') {
    console.error(`${LOG_PREFIX} No authorization code received`);
    return res.redirect('/?error=no_code');
  }

  console.log(`${LOG_PREFIX} Received OAuth callback`);

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    storedTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    };

    client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    console.log(`${LOG_PREFIX} OAuth successful for: ${userInfo.data.email}`);

    // Redirect back to UI with success
    res.redirect('/?auth=success&email=' + encodeURIComponent(userInfo.data.email || ''));
  } catch (error) {
    console.error(`${LOG_PREFIX} OAuth callback error:`, error);
    res.redirect('/?error=' + encodeURIComponent(error instanceof Error ? error.message : 'oauth_failed'));
  }
});

/**
 * GET /oauth/status
 * Returns current authentication status
 */
router.get('/status', async (req: Request, res: Response) => {
  if (!storedTokens) {
    return res.json({
      authenticated: false,
    });
  }

  try {
    const client = getAuthenticatedClient();
    if (!client) {
      return res.json({
        authenticated: false,
      });
    }

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    res.json({
      authenticated: true,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
      expiresAt: storedTokens.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Status check error:`, error);
    res.json({
      authenticated: false,
      error: error instanceof Error ? error.message : 'status_check_failed',
    });
  }
});

/**
 * POST /oauth/logout
 * Clears stored tokens
 */
router.post('/logout', (_req: Request, res: Response) => {
  clearTokens();
  res.json({ success: true });
});

export default router;
