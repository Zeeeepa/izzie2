/**
 * POST /api/train/feedback
 * Submit feedback for a sample
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { submitFeedback, skipSample, getActiveSession, updateSessionStatus, getSession } from '@/lib/training';
import type { FeedbackSubmission, TrainingSession } from '@/lib/training';
import { dbClient } from '@/lib/db';
import { trainingSessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface FeedbackRequest {
  sampleId: string;
  action: 'feedback' | 'skip';
  isCorrect?: boolean;
  correctedLabel?: string;
  notes?: string;
}

/**
 * Check if training budget is exhausted and auto-pause if needed
 * Returns training budget info for the response
 */
async function checkAndHandleBudgetExhaustion(
  sessionId: string
): Promise<{ budgetExhausted: boolean; trainingBudget: { total: number; used: number; remaining: number } }> {
  const db = dbClient.getDb();

  // Get the latest session state from the database
  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return {
      budgetExhausted: false,
      trainingBudget: { total: 0, used: 0, remaining: 0 },
    };
  }

  const trainingBudget = {
    total: session.trainingBudgetTotal,
    used: session.trainingBudgetUsed,
    remaining: session.trainingBudgetTotal - session.trainingBudgetUsed,
  };

  // Check if training budget is exhausted
  if (session.trainingBudgetUsed >= session.trainingBudgetTotal) {
    // Auto-pause the session
    await updateSessionStatus(sessionId, 'paused');
    console.log(`[Train Feedback] Training budget exhausted for session ${sessionId}, auto-pausing`);
    return { budgetExhausted: true, trainingBudget };
  }

  return { budgetExhausted: false, trainingBudget };
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);
    const body: FeedbackRequest = await request.json();

    // Validate request
    if (!body.sampleId) {
      return NextResponse.json(
        { success: false, error: 'Sample ID is required' },
        { status: 400 }
      );
    }

    // Verify user has active session
    const trainingSession = await getActiveSession(userId);
    if (!trainingSession) {
      return NextResponse.json(
        { success: false, error: 'No active training session' },
        { status: 404 }
      );
    }

    // Check if training budget is already exhausted before processing
    const preBudgetCheck = await checkAndHandleBudgetExhaustion(trainingSession.id);
    if (preBudgetCheck.budgetExhausted) {
      return NextResponse.json({
        success: true,
        budgetExhausted: true,
        message: 'Training paused - budget exhausted. Add more budget to continue.',
        trainingBudget: preBudgetCheck.trainingBudget,
      });
    }

    let updatedSample;

    if (body.action === 'skip') {
      updatedSample = await skipSample(body.sampleId);
    } else {
      if (body.isCorrect === undefined) {
        return NextResponse.json(
          { success: false, error: 'isCorrect is required for feedback' },
          { status: 400 }
        );
      }

      const submission: FeedbackSubmission = {
        sampleId: body.sampleId,
        isCorrect: body.isCorrect,
        correctedLabel: body.correctedLabel,
        notes: body.notes,
      };

      updatedSample = await submitFeedback(submission);
    }

    if (!updatedSample) {
      return NextResponse.json(
        { success: false, error: 'Sample not found' },
        { status: 404 }
      );
    }

    // Check budget after feedback submission
    const postBudgetCheck = await checkAndHandleBudgetExhaustion(trainingSession.id);

    return NextResponse.json({
      success: true,
      sample: updatedSample,
      budgetExhausted: postBudgetCheck.budgetExhausted,
      trainingBudget: postBudgetCheck.trainingBudget,
      ...(postBudgetCheck.budgetExhausted && {
        message: 'Training paused - budget exhausted. Add more budget to continue.',
      }),
    });
  } catch (error) {
    console.error('[Train Feedback] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit feedback',
      },
      { status: 500 }
    );
  }
}
