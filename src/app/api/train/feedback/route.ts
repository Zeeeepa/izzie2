/**
 * POST /api/train/feedback
 * Submit feedback for a sample
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { submitFeedback, skipSample, getActiveSession } from '@/lib/training';
import type { FeedbackSubmission } from '@/lib/training';

interface FeedbackRequest {
  sampleId: string;
  action: 'feedback' | 'skip';
  isCorrect?: boolean;
  correctedLabel?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body: FeedbackRequest = await request.json();

    // Validate request
    if (!body.sampleId) {
      return NextResponse.json(
        { success: false, error: 'Sample ID is required' },
        { status: 400 }
      );
    }

    // Verify user has active session
    const trainingSession = await getActiveSession(session.user.id);
    if (!trainingSession) {
      return NextResponse.json(
        { success: false, error: 'No active training session' },
        { status: 404 }
      );
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

    return NextResponse.json({
      success: true,
      sample: updatedSample,
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
