/**
 * GET /api/train/sample
 * Get next sample for feedback
 *
 * POST /api/train/sample
 * Generate more samples for the session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import {
  getActiveSession,
  getNextSample,
  generateSamples,
  getUncertainSamples,
} from '@/lib/training';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Get active training session
    const trainingSession = await getActiveSession(userId);

    if (!trainingSession) {
      return NextResponse.json(
        { success: false, error: 'No active training session' },
        { status: 404 }
      );
    }

    // Get next sample
    const sample = await getNextSample(trainingSession.id);

    return NextResponse.json({
      success: true,
      sample,
      hasMore: !!sample,
    });
  } catch (error) {
    console.error('[Train Sample GET] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sample',
      },
      { status: 500 }
    );
  }
}

interface GenerateRequest {
  count?: number;
  uncertainOnly?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);
    const body: GenerateRequest = await request.json();

    // Get active training session
    const trainingSession = await getActiveSession(userId);

    if (!trainingSession) {
      return NextResponse.json(
        { success: false, error: 'No active training session' },
        { status: 404 }
      );
    }

    if (body.uncertainOnly) {
      // Get uncertain samples for priority review
      const samples = await getUncertainSamples(
        trainingSession.id,
        body.count || 10
      );

      return NextResponse.json({
        success: true,
        samples,
        count: samples.length,
      });
    }

    // Generate new samples
    const generated = await generateSamples(
      trainingSession.id,
      body.count || 10
    );

    return NextResponse.json({
      success: true,
      generated,
    });
  } catch (error) {
    console.error('[Train Sample POST] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate samples',
      },
      { status: 500 }
    );
  }
}
