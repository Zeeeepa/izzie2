/**
 * POST /api/discover/start
 * Start autonomous discovery with budget, returns session info
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import {
  startAutonomousTraining,
  getActiveAutonomousSession,
  getAutonomousStatus,
} from '@/lib/training/autonomous-training';
import type { TrainingMode } from '@/lib/training/types';

interface StartDiscoverRequest {
  budget: number; // in dollars (discovery budget)
  trainingBudget?: number; // in dollars (training budget, optional)
  mode?: TrainingMode;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);
    const body: StartDiscoverRequest = await request.json();

    // Validate budget
    if (!body.budget || body.budget < 1 || body.budget > 100) {
      return NextResponse.json(
        { success: false, error: 'Budget must be between $1 and $100' },
        { status: 400 }
      );
    }

    // Check for existing active session
    const existingSession = await getActiveAutonomousSession(userId);
    if (existingSession && existingSession.status === 'running') {
      const status = await getAutonomousStatus(existingSession.id);
      return NextResponse.json({
        success: true,
        message: 'Discovery session already running',
        session: {
          id: existingSession.id,
          status: status.status,
        },
        ...status,
      });
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
      console.log('[Discover Start] Tokens refreshed for user:', userId);
      await updateGoogleTokens(userId, newTokens);
    });

    // Start autonomous training session with separate budgets
    const { sessionId, status } = await startAutonomousTraining(userId, oauth2Client, {
      budget: Math.round(body.budget * 100), // Convert dollars to cents (discovery)
      trainingBudget: body.trainingBudget ? Math.round(body.trainingBudget * 100) : undefined, // Convert dollars to cents (training)
      mode: body.mode || 'collect_feedback',
    });

    console.log(`[Discover Start] Started discovery session ${sessionId} for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Discovery session started',
      session: {
        id: sessionId,
        status: status.status,
      },
      // Legacy budget field (same as discoveryBudget for backward compatibility)
      budget: status.budget,
      // Separate budgets
      discoveryBudget: status.discoveryBudget,
      trainingBudget: status.trainingBudget,
      progress: status.progress,
      startedAt: status.startedAt,
    });
  } catch (error) {
    console.error('[Discover Start] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start discovery',
      },
      { status: 500 }
    );
  }
}
