/**
 * POST /api/train/budget
 * Set/update training budget
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getActiveSession, updateBudget, updateSessionStatus } from '@/lib/training';

interface BudgetRequest {
  budget?: number; // in dollars
  action?: 'pause' | 'resume' | 'cancel' | 'restart';
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);
    const body: BudgetRequest = await request.json();

    // Get active training session
    const trainingSession = await getActiveSession(userId);

    if (!trainingSession) {
      return NextResponse.json(
        { success: false, error: 'No active training session' },
        { status: 404 }
      );
    }

    let updatedSession = trainingSession;

    // Update budget if provided
    if (body.budget !== undefined) {
      if (body.budget < 0) {
        return NextResponse.json(
          { success: false, error: 'Budget cannot be negative' },
          { status: 400 }
        );
      }

      const budgetInCents = Math.round(body.budget * 100);
      updatedSession = (await updateBudget(trainingSession.id, budgetInCents)) || trainingSession;
    }

    // Handle pause/resume/cancel/restart actions
    if (body.action === 'pause') {
      updatedSession = (await updateSessionStatus(trainingSession.id, 'paused')) || updatedSession;
    } else if (body.action === 'resume') {
      updatedSession = (await updateSessionStatus(trainingSession.id, 'collecting')) || updatedSession;
    } else if (body.action === 'cancel') {
      // Mark the current session as complete (cancelled)
      updatedSession = (await updateSessionStatus(trainingSession.id, 'complete')) || updatedSession;
      return NextResponse.json({
        success: true,
        message: 'Training cancelled',
        session: updatedSession,
      });
    } else if (body.action === 'restart') {
      // Cancel current session and return - user can start a new one
      await updateSessionStatus(trainingSession.id, 'complete');
      return NextResponse.json({
        success: true,
        message: 'Training cancelled. You can start a new session.',
        session: null,
      });
    }

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    console.error('[Train Budget] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update budget',
      },
      { status: 500 }
    );
  }
}
