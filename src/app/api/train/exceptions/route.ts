/**
 * GET /api/train/exceptions
 * Get items needing human review
 *
 * POST /api/train/exceptions
 * Update exception status
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getActiveSession, getExceptions, updateException } from '@/lib/training';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'reviewed' | 'dismissed' | null;

    // Get active training session
    const trainingSession = await getActiveSession(session.user.id);

    if (!trainingSession) {
      return NextResponse.json({
        success: true,
        exceptions: [],
        count: 0,
      });
    }

    // Get exceptions
    const exceptions = await getExceptions(
      trainingSession.id,
      status || undefined
    );

    return NextResponse.json({
      success: true,
      exceptions,
      count: exceptions.length,
    });
  } catch (error) {
    console.error('[Train Exceptions GET] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get exceptions',
      },
      { status: 500 }
    );
  }
}

interface UpdateExceptionRequest {
  exceptionId: string;
  status: 'reviewed' | 'dismissed';
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body: UpdateExceptionRequest = await request.json();

    // Validate request
    if (!body.exceptionId || !body.status) {
      return NextResponse.json(
        { success: false, error: 'Exception ID and status are required' },
        { status: 400 }
      );
    }

    // Update exception
    const exception = await updateException(body.exceptionId, body.status);

    if (!exception) {
      return NextResponse.json(
        { success: false, error: 'Exception not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      exception,
    });
  } catch (error) {
    console.error('[Train Exceptions POST] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update exception',
      },
      { status: 500 }
    );
  }
}
