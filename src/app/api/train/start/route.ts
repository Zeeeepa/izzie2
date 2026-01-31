/**
 * POST /api/train/start
 * Start a new training session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  createTrainingSession,
  getActiveSession,
  generateSamples,
} from '@/lib/training';
import type { TrainingMode, SampleType } from '@/lib/training';

interface StartRequest {
  sampleSize?: number;
  budget?: number; // in dollars
  mode?: TrainingMode;
  sampleTypes?: SampleType[];
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body: StartRequest = await request.json();

    // Check for existing active session
    const existingSession = await getActiveSession(session.user.id);
    if (existingSession) {
      return NextResponse.json(
        {
          success: false,
          error: 'An active training session already exists',
          session: existingSession,
        },
        { status: 400 }
      );
    }

    // Create new training session
    const trainingSession = await createTrainingSession(session.user.id, {
      sampleSize: body.sampleSize || 100,
      budget: Math.round((body.budget || 5) * 100), // Convert dollars to cents
      mode: body.mode || 'collect_feedback',
      sampleTypes: body.sampleTypes || ['entity'],
      autoTrainThreshold: body.sampleSize
        ? Math.floor(body.sampleSize * 0.5)
        : 50,
    });

    // Generate initial samples
    await generateSamples(trainingSession.id, 10);

    return NextResponse.json({
      success: true,
      session: trainingSession,
    });
  } catch (error) {
    console.error('[Train Start] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start training',
      },
      { status: 500 }
    );
  }
}
