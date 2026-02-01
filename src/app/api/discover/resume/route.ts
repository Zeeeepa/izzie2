/**
 * POST /api/discover/resume
 * Resume a paused discovery session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import {
  getActiveAutonomousSession,
  resumeAutonomousTraining,
  getAutonomousStatus,
} from '@/lib/training/autonomous-training';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Get active discovery session
    const session = await getActiveAutonomousSession(userId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No active discovery session found' },
        { status: 404 }
      );
    }

    if (session.status === 'running') {
      return NextResponse.json({
        success: true,
        message: 'Discovery session is already running',
        session: {
          id: session.id,
          status: 'running',
        },
      });
    }

    if (session.status !== 'paused') {
      return NextResponse.json(
        { success: false, error: `Cannot resume session with status: ${session.status}` },
        { status: 400 }
      );
    }

    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens || !tokens.accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Google account connected. Please link your Google account first.' },
        { status: 400 }
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Discover Resume] Tokens refreshed for user:', userId);
      await updateGoogleTokens(userId, newTokens);
    });

    // Resume the session
    await resumeAutonomousTraining(session.id, oauth2Client);

    console.log(`[Discover Resume] Resumed session ${session.id} for user ${userId}`);

    // Get updated status
    const status = await getAutonomousStatus(session.id);

    return NextResponse.json({
      success: true,
      message: 'Discovery session resumed',
      session: {
        id: session.id,
        status: 'running',
      },
      // Legacy budget field (same as discoveryBudget)
      budget: status.budget,
      // Separate budgets
      discoveryBudget: status.discoveryBudget,
      trainingBudget: status.trainingBudget,
      progress: status.progress,
    });
  } catch (error) {
    console.error('[Discover Resume] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resume discovery',
      },
      { status: 500 }
    );
  }
}
