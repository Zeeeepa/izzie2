/**
 * Google Tasks Sync API Endpoint
 * Triggers task synchronization from Google Tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { inngest } from '@/lib/events';
import type { TaskContentExtractedPayload } from '@/lib/events/types';

// In-memory sync status (in production, use Redis or database)
let syncStatus: {
  isRunning: boolean;
  tasksProcessed: number;
  eventsSent: number;
  lastSync?: Date;
  error?: string;
} = {
  isRunning: false,
  tasksProcessed: 0,
  eventsSent: 0,
};

/**
 * POST /api/tasks/sync
 * Start task synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Get authenticated user session
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in first.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      maxResults = 100,
      showCompleted = true,
      showHidden = false,
    } = body;

    // Start sync (don't await - run in background)
    startSync(
      session.accessToken,
      session.user?.email || 'default',
      maxResults,
      showCompleted,
      showHidden
    ).catch((error) => {
      console.error('[Tasks Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Task sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Tasks Sync] Failed to start sync:', error);
    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(
  accessToken: string,
  userEmail: string,
  maxResults: number,
  showCompleted: boolean,
  showHidden: boolean
): Promise<void> {
  syncStatus = {
    isRunning: true,
    tasksProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  try {
    // Initialize OAuth2 client with user's access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Initialize Tasks API
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

    console.log('[Tasks Sync] Fetching task lists...');

    // Get all task lists
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: 100,
    });

    const taskLists = taskListsResponse.data.items || [];
    console.log(`[Tasks Sync] Found ${taskLists.length} task lists`);

    let totalProcessed = 0;
    const allTasks: Array<{
      id: string;
      title: string;
      notes?: string | null;
      due?: string | null;
      status: string;
      listId: string;
      listTitle: string;
      updated?: string | null;
      completed?: string | null;
      parent?: string | null;
    }> = [];

    // Fetch tasks from each list
    for (const list of taskLists) {
      if (!list.id || !list.title) continue;

      console.log(`[Tasks Sync] Fetching tasks from list: ${list.title}`);

      try {
        const tasksResponse = await tasks.tasks.list({
          tasklist: list.id,
          maxResults: Math.min(maxResults - totalProcessed, 100),
          showCompleted,
          showHidden,
        });

        const taskItems = tasksResponse.data.items || [];

        for (const task of taskItems) {
          if (!task.id || !task.title) continue;

          allTasks.push({
            id: task.id,
            title: task.title,
            notes: task.notes,
            due: task.due,
            status: task.status || 'needsAction',
            listId: list.id,
            listTitle: list.title,
            updated: task.updated,
            completed: task.completed,
            parent: task.parent,
          });

          totalProcessed++;

          if (totalProcessed >= maxResults) {
            break;
          }
        }

        console.log(`[Tasks Sync] Found ${taskItems.length} tasks in ${list.title}`);
      } catch (listError) {
        console.error(`[Tasks Sync] Error fetching tasks from list ${list.title}:`, listError);
        // Continue with other lists
      }

      if (totalProcessed >= maxResults) {
        break;
      }
    }

    syncStatus.tasksProcessed = totalProcessed;

    // Emit events for entity extraction (batch send for efficiency)
    if (allTasks.length > 0) {
      const events = allTasks.map((task) => ({
        name: 'izzie/ingestion.task.extracted' as const,
        data: {
          userId: userEmail,
          taskId: task.id,
          title: task.title,
          notes: task.notes || '',
          due: task.due || undefined,
          status: task.status,
          listId: task.listId,
          listTitle: task.listTitle,
          updated: task.updated || undefined,
          completed: task.completed || undefined,
          parent: task.parent || undefined,
        } satisfies TaskContentExtractedPayload,
      }));

      await inngest.send(events);
      syncStatus.eventsSent = events.length;
      console.log(`[Tasks Sync] Sent ${events.length} events for entity extraction`);
    }

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    console.log(
      `[Tasks Sync] Completed. Processed ${totalProcessed} tasks, sent ${syncStatus.eventsSent} events for extraction`
    );
  } catch (error) {
    console.error('[Tasks Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
