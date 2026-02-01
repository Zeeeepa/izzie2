/**
 * POST /api/train/budget
 * Set/update training budget
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getActiveSession, updateBudget, updateSessionStatus } from '@/lib/training';
import { dbClient } from '@/lib/db';
import { trainingSessions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

interface BudgetRequest {
  budget?: number; // in dollars (for legacy/discovery budget)
  trainingBudget?: number; // in dollars (for training budget)
  addTrainingBudget?: number; // in dollars (amount to ADD to current training budget)
  action?: 'pause' | 'resume' | 'cancel' | 'restart';
}

/**
 * Add to the training budget (for top-up functionality)
 */
async function addToTrainingBudget(
  sessionId: string,
  amountInCents: number
): Promise<{ trainingBudgetTotal: number; trainingBudgetUsed: number; trainingBudgetRemaining: number }> {
  const db = dbClient.getDb();

  const [updated] = await db
    .update(trainingSessions)
    .set({
      trainingBudgetTotal: sql`${trainingSessions.trainingBudgetTotal} + ${amountInCents}`,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId))
    .returning();

  return {
    trainingBudgetTotal: updated.trainingBudgetTotal,
    trainingBudgetUsed: updated.trainingBudgetUsed,
    trainingBudgetRemaining: updated.trainingBudgetTotal - updated.trainingBudgetUsed,
  };
}

/**
 * Set the training budget to a specific value
 */
async function setTrainingBudget(
  sessionId: string,
  amountInCents: number
): Promise<{ trainingBudgetTotal: number; trainingBudgetUsed: number; trainingBudgetRemaining: number }> {
  const db = dbClient.getDb();

  const [updated] = await db
    .update(trainingSessions)
    .set({
      trainingBudgetTotal: amountInCents,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId))
    .returning();

  return {
    trainingBudgetTotal: updated.trainingBudgetTotal,
    trainingBudgetUsed: updated.trainingBudgetUsed,
    trainingBudgetRemaining: updated.trainingBudgetTotal - updated.trainingBudgetUsed,
  };
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
    let trainingBudgetInfo: { trainingBudgetTotal: number; trainingBudgetUsed: number; trainingBudgetRemaining: number } | null = null;

    // Update legacy/discovery budget if provided
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

    // Add to training budget (top-up)
    if (body.addTrainingBudget !== undefined) {
      if (body.addTrainingBudget <= 0) {
        return NextResponse.json(
          { success: false, error: 'Amount to add must be positive' },
          { status: 400 }
        );
      }

      const amountInCents = Math.round(body.addTrainingBudget * 100);
      trainingBudgetInfo = await addToTrainingBudget(trainingSession.id, amountInCents);
      console.log(`[Train Budget] Added $${body.addTrainingBudget} to training budget for session ${trainingSession.id}`);
    }

    // Set training budget to specific value
    if (body.trainingBudget !== undefined) {
      if (body.trainingBudget < 0) {
        return NextResponse.json(
          { success: false, error: 'Training budget cannot be negative' },
          { status: 400 }
        );
      }

      const amountInCents = Math.round(body.trainingBudget * 100);
      trainingBudgetInfo = await setTrainingBudget(trainingSession.id, amountInCents);
      console.log(`[Train Budget] Set training budget to $${body.trainingBudget} for session ${trainingSession.id}`);
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
      ...(trainingBudgetInfo && {
        trainingBudget: {
          total: trainingBudgetInfo.trainingBudgetTotal,
          used: trainingBudgetInfo.trainingBudgetUsed,
          remaining: trainingBudgetInfo.trainingBudgetRemaining,
        },
      }),
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
