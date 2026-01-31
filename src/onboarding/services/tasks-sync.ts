/**
 * Tasks Sync Service
 *
 * Syncs discovered action_item entities from onboarding to Google Tasks.
 * Creates tasks in a dedicated list, checking for duplicates by title.
 */

import { google, tasks_v1, Auth } from 'googleapis';
import type { DiscoveredEntity } from '../types';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[TasksSync]';

/** Default list name for discovered tasks */
const DEFAULT_TASK_LIST_NAME = 'Izzie Discovered';

export type TaskSyncAction = 'created' | 'skipped';

export interface TaskSyncResult {
  action: TaskSyncAction;
  taskId?: string;
  taskListId?: string;
  error?: string;
}

export interface TaskSyncSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  taskListId: string;
  taskListName: string;
}

/** Minimal task list type */
interface TaskList {
  id: string;
  title: string;
}

/** Minimal task type */
interface Task {
  id: string;
  title: string;
}

/**
 * Get Tasks API client
 */
function getTasksApi(auth: Auth.OAuth2Client): tasks_v1.Tasks {
  return google.tasks({ version: 'v1', auth });
}

/**
 * Find or create the task list for synced tasks
 * @param auth - OAuth2 client
 * @param listName - Name of the task list (default: "Izzie Discovered")
 */
export async function ensureTaskList(
  auth: Auth.OAuth2Client,
  listName: string = DEFAULT_TASK_LIST_NAME
): Promise<TaskList> {
  console.log(`${LOG_PREFIX} Ensuring task list "${listName}" exists`);

  const tasks = getTasksApi(auth);

  try {
    // Fetch all task lists
    console.log(`${LOG_PREFIX} Fetching existing task lists...`);
    const response = await tasks.tasklists.list({ maxResults: 100 });
    const taskLists = response.data.items || [];
    console.log(`${LOG_PREFIX} Found ${taskLists.length} existing task lists:`,
      taskLists.map(l => ({ id: l.id, title: l.title }))
    );

    // Find existing list by name
    const existingList = taskLists.find(
      (list) => list.title?.toLowerCase() === listName.toLowerCase()
    );

    if (existingList && existingList.id) {
      console.log(`${LOG_PREFIX} Using existing task list:`, {
        id: existingList.id,
        title: existingList.title,
      });
      return {
        id: existingList.id,
        title: existingList.title || listName,
      };
    }

    // Create new list
    console.log(`${LOG_PREFIX} Creating new task list: "${listName}"`);
    const createResponse = await tasks.tasklists.insert({
      requestBody: { title: listName },
    });

    if (!createResponse.data.id) {
      throw new Error('Failed to create task list - no ID returned');
    }

    console.log(`${LOG_PREFIX} Successfully created task list:`, {
      id: createResponse.data.id,
      title: createResponse.data.title,
    });
    return {
      id: createResponse.data.id,
      title: createResponse.data.title || listName,
    };
  } catch (error: unknown) {
    console.error(`${LOG_PREFIX} Failed to ensure task list:`, {
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    // Log Google API specific error details if available
    const googleError = error as { code?: number; status?: string; errors?: unknown[]; response?: { data?: unknown } };
    if (googleError.code || googleError.status || googleError.errors) {
      console.error(`${LOG_PREFIX} Google API error details:`, {
        code: googleError.code,
        status: googleError.status,
        errors: googleError.errors,
        responseData: googleError.response?.data,
      });
    }

    throw new Error(
      `Failed to ensure task list: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a task with the given title already exists in the list
 */
async function taskExistsByTitle(
  auth: Auth.OAuth2Client,
  taskListId: string,
  title: string
): Promise<boolean> {
  const tasks = getTasksApi(auth);

  try {
    const response = await tasks.tasks.list({
      tasklist: taskListId,
      maxResults: 100,
      showCompleted: true,
    });

    const taskItems = response.data.items || [];
    return taskItems.some(
      (task) => task.title?.toLowerCase() === title.toLowerCase()
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to check for existing task:`, error);
    // On error, assume task doesn't exist to allow creation attempt
    return false;
  }
}

/**
 * Sync a single action_item entity to Google Tasks
 * @param auth - OAuth2 client
 * @param taskListId - The task list ID to add tasks to
 * @param entity - The action_item entity to sync
 */
export async function syncEntityToTasks(
  auth: Auth.OAuth2Client,
  taskListId: string,
  entity: Entity | DiscoveredEntity
): Promise<TaskSyncResult> {
  // Only sync action_item entities
  if (entity.type !== 'action_item') {
    return { action: 'skipped', error: 'Not an action_item entity' };
  }

  const title = entity.value.trim();
  if (!title) {
    return { action: 'skipped', error: 'Empty task title' };
  }

  // Log the task list being used
  console.log(`${LOG_PREFIX} Syncing entity to task list:`, {
    taskListId,
    entityValue: entity.value,
    entityType: entity.type,
    occurrenceCount: (entity as DiscoveredEntity).occurrenceCount || 1,
  });

  const tasks = getTasksApi(auth);

  try {
    // Check for duplicates by title
    console.log(`${LOG_PREFIX} Checking for duplicate task: "${title}"`);
    const exists = await taskExistsByTitle(auth, taskListId, title);
    if (exists) {
      console.log(`${LOG_PREFIX} Task already exists, skipping: "${title}"`);
      return { action: 'skipped', taskListId, error: 'Duplicate task' };
    }

    // Build task notes from entity metadata
    const notes = buildTaskNotes(entity);

    // Log the request being made
    const createRequest = {
      tasklist: taskListId,
      requestBody: {
        title,
        notes,
      },
    };
    console.log(`${LOG_PREFIX} Creating task with request:`, {
      taskListId,
      title,
      notesLength: notes.length,
    });

    // Create the task
    const response = await tasks.tasks.insert(createRequest);

    if (!response.data.id) {
      throw new Error('Failed to create task - no ID returned');
    }

    // Log when task is successfully created
    console.log(`${LOG_PREFIX} Successfully created task:`, {
      taskId: response.data.id,
      taskListId,
      title: response.data.title,
      status: response.data.status,
      selfLink: response.data.selfLink,
    });

    return {
      action: 'created',
      taskId: response.data.id,
      taskListId,
    };
  } catch (error: unknown) {
    // Log full error details for debugging
    console.error(`${LOG_PREFIX} Failed to sync entity "${entity.value}":`, {
      taskListId,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    // Log Google API specific error details if available
    const googleError = error as { code?: number; status?: string; errors?: unknown[]; response?: { data?: unknown } };
    if (googleError.code || googleError.status || googleError.errors) {
      console.error(`${LOG_PREFIX} Google API error details:`, {
        code: googleError.code,
        status: googleError.status,
        errors: googleError.errors,
        responseData: googleError.response?.data,
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      action: 'skipped',
      taskListId,
      error: errorMessage,
    };
  }
}

/**
 * Build task notes from entity metadata
 */
function buildTaskNotes(entity: Entity | DiscoveredEntity): string {
  const parts: string[] = [];

  // Add context if available
  if (entity.context) {
    parts.push(`Context: ${entity.context}`);
  }

  // Add discovery metadata if available
  const discoveredEntity = entity as DiscoveredEntity;
  if (discoveredEntity.occurrenceCount) {
    parts.push(`Seen ${discoveredEntity.occurrenceCount} time(s) in emails`);
  }

  if (discoveredEntity.firstSeen) {
    parts.push(`First seen: ${new Date(discoveredEntity.firstSeen).toLocaleDateString()}`);
  }

  if (discoveredEntity.lastSeen) {
    parts.push(`Last seen: ${new Date(discoveredEntity.lastSeen).toLocaleDateString()}`);
  }

  parts.push('');
  parts.push('Discovered via Izzie email analysis');

  return parts.join('\n');
}

/**
 * Sync multiple action_item entities to Google Tasks
 * @param auth - OAuth2 client
 * @param entities - Array of entities to sync
 * @param options - Sync options
 */
export async function syncEntitiesToTasks(
  auth: Auth.OAuth2Client,
  entities: Array<Entity | DiscoveredEntity>,
  options?: {
    listName?: string;
  }
): Promise<{
  results: Map<string, TaskSyncResult>;
  summary: TaskSyncSummary;
}> {
  const listName = options?.listName || DEFAULT_TASK_LIST_NAME;

  // Filter to only action_item entities
  const actionItems = entities.filter((e) => e.type === 'action_item');

  console.log(`${LOG_PREFIX} Syncing ${actionItems.length} action_item entities to tasks`);

  // Ensure task list exists
  const taskList = await ensureTaskList(auth, listName);

  const results = new Map<string, TaskSyncResult>();
  const summary: TaskSyncSummary = {
    total: actionItems.length,
    created: 0,
    skipped: 0,
    errors: 0,
    taskListId: taskList.id,
    taskListName: taskList.title,
  };

  for (const entity of actionItems) {
    const result = await syncEntityToTasks(auth, taskList.id, entity);
    results.set(entity.value, result);

    if (result.action === 'created') {
      summary.created++;
    } else {
      summary.skipped++;
      if (result.error && result.error !== 'Duplicate task') {
        summary.errors++;
      }
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `${LOG_PREFIX} Sync complete: ${summary.created} created, ${summary.skipped} skipped`
  );

  return { results, summary };
}

/**
 * Batch sync with progress callback
 */
export async function syncEntitiesWithProgress(
  auth: Auth.OAuth2Client,
  entities: Array<Entity | DiscoveredEntity>,
  onProgress?: (current: number, total: number, entityValue: string, result: TaskSyncResult) => void,
  options?: {
    listName?: string;
  }
): Promise<TaskSyncSummary> {
  const listName = options?.listName || DEFAULT_TASK_LIST_NAME;

  // Filter to only action_item entities
  const actionItems = entities.filter((e) => e.type === 'action_item');

  console.log(`${LOG_PREFIX} Starting batch sync of ${actionItems.length} action_item entities`);

  // Ensure task list exists
  const taskList = await ensureTaskList(auth, listName);

  const summary: TaskSyncSummary = {
    total: actionItems.length,
    created: 0,
    skipped: 0,
    errors: 0,
    taskListId: taskList.id,
    taskListName: taskList.title,
  };

  for (let i = 0; i < actionItems.length; i++) {
    const entity = actionItems[i];
    const result = await syncEntityToTasks(auth, taskList.id, entity);

    if (result.action === 'created') {
      summary.created++;
    } else {
      summary.skipped++;
      if (result.error && result.error !== 'Duplicate task') {
        summary.errors++;
      }
    }

    if (onProgress) {
      onProgress(i + 1, actionItems.length, entity.value, result);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return summary;
}
