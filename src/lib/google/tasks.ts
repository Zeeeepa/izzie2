/**
 * Google Tasks Service
 * Provides methods to interact with Google Tasks API
 */

import { google, tasks_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import type { TaskList, Task, TaskListBatch, TaskBatch } from './types';

/**
 * Initialize OAuth2 client with user's tokens for Tasks API
 * @param userId - The user ID
 * @param accountId - Optional specific Google account ID. If not provided, uses primary account.
 */
async function getTasksClient(
  userId: string,
  accountId?: string
): Promise<{
  auth: OAuth2Client;
  tasks: tasks_v1.Tasks;
  accountId: string;
}> {
  try {
    // Get user's Google OAuth tokens for specific account (or primary)
    const tokens = await getGoogleTokens(userId, accountId);
    if (!tokens) {
      throw new Error('No Google tokens found for user');
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
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens if needed
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Tasks] Tokens refreshed for user:', userId);
      await updateGoogleTokens(userId, newTokens);
    });

    // Initialize Tasks API
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

    return { auth: oauth2Client, tasks, accountId: tokens.accountId };
  } catch (error) {
    console.error('[Tasks] Failed to initialize client:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to initialize tasks client'
    );
  }
}

/**
 * Convert Google Tasks API task list to our TaskList type
 */
function mapTaskList(taskList: tasks_v1.Schema$TaskList): TaskList {
  return {
    id: taskList.id || '',
    title: taskList.title || 'Untitled List',
    updated: taskList.updated || undefined,
    selfLink: taskList.selfLink || undefined,
  };
}

/**
 * Convert Google Tasks API task to our Task type
 */
function mapTask(task: tasks_v1.Schema$Task): Task {
  return {
    id: task.id || '',
    title: task.title || 'Untitled Task',
    updated: task.updated || new Date().toISOString(),
    selfLink: task.selfLink || undefined,
    parent: task.parent || undefined,
    position: task.position || undefined,
    notes: task.notes || undefined,
    status: (task.status as 'needsAction' | 'completed') || 'needsAction',
    due: task.due || undefined,
    completed: task.completed || undefined,
    deleted: task.deleted || undefined,
    hidden: task.hidden || undefined,
    links: task.links?.map((link) => ({
      type: link.type || '',
      description: link.description || undefined,
      link: link.link || '',
    })),
  };
}

/**
 * List all task lists for a user
 * @param userId - The user ID
 * @param options - List options including optional accountId for multi-account support
 */
export async function listTaskLists(
  userId: string,
  options?: {
    maxResults?: number;
    pageToken?: string;
    accountId?: string;
  }
): Promise<TaskListBatch> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasklists.list({
    maxResults: options?.maxResults || 100,
    pageToken: options?.pageToken,
  });

  return {
    taskLists: (response.data.items || []).map(mapTaskList),
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get a specific task list
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param options - Optional settings including accountId for multi-account support
 */
export async function getTaskList(
  userId: string,
  taskListId: string,
  options?: { accountId?: string }
): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasklists.get({
    tasklist: taskListId,
  });

  return mapTaskList(response.data);
}

/**
 * List tasks from a task list
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param options - List options including optional accountId for multi-account support
 */
export async function listTasks(
  userId: string,
  taskListId: string,
  options?: {
    maxResults?: number;
    pageToken?: string;
    showCompleted?: boolean;
    showDeleted?: boolean;
    showHidden?: boolean;
    dueMin?: string; // RFC 3339 timestamp
    dueMax?: string; // RFC 3339 timestamp
    completedMin?: string; // RFC 3339 timestamp
    completedMax?: string; // RFC 3339 timestamp
    updatedMin?: string; // RFC 3339 timestamp
    accountId?: string; // Optional specific Google account ID for multi-account support
  }
): Promise<TaskBatch> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasks.list({
    tasklist: taskListId,
    maxResults: options?.maxResults || 100,
    pageToken: options?.pageToken,
    showCompleted: options?.showCompleted,
    showDeleted: options?.showDeleted,
    showHidden: options?.showHidden,
    dueMin: options?.dueMin,
    dueMax: options?.dueMax,
    completedMin: options?.completedMin,
    completedMax: options?.completedMax,
    updatedMin: options?.updatedMin,
  });

  return {
    tasks: (response.data.items || []).map(mapTask),
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get a specific task
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param taskId - The task ID
 * @param options - Optional settings including accountId for multi-account support
 */
export async function getTask(
  userId: string,
  taskListId: string,
  taskId: string,
  options?: { accountId?: string }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  return mapTask(response.data);
}

/**
 * Fetch all tasks from all task lists
 * Useful for syncing and entity extraction
 * @param userId - The user ID
 * @param options - Fetch options including optional accountId for multi-account support
 */
export async function fetchAllTasks(
  userId: string,
  options?: {
    maxTasksPerList?: number;
    showCompleted?: boolean;
    showHidden?: boolean;
    accountId?: string; // Optional specific Google account ID for multi-account support
  }
): Promise<
  Array<{
    task: Task;
    taskListId: string;
    taskListTitle: string;
  }>
> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  // First, get all task lists
  const taskListsResponse = await tasks.tasklists.list({
    maxResults: 100,
  });

  const taskLists = taskListsResponse.data.items || [];
  console.log(`[Tasks] Found ${taskLists.length} task lists`);

  const allTasks: Array<{
    task: Task;
    taskListId: string;
    taskListTitle: string;
  }> = [];

  // Fetch tasks from each list
  for (const taskList of taskLists) {
    if (!taskList.id || !taskList.title) continue;

    try {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        maxResults: options?.maxTasksPerList || 100,
        showCompleted: options?.showCompleted !== false, // Default true
        showHidden: options?.showHidden || false,
      });

      const taskItems = (tasksResponse.data.items || []).map((t) => ({
        task: mapTask(t),
        taskListId: taskList.id!,
        taskListTitle: taskList.title || 'Untitled List',
      }));

      allTasks.push(...taskItems);
      console.log(`[Tasks] Found ${taskItems.length} tasks in "${taskList.title}"`);
    } catch (listError) {
      console.error(`[Tasks] Error fetching tasks from list "${taskList.title}":`, listError);
      // Continue with other lists
    }
  }

  console.log(`[Tasks] Total: ${allTasks.length} tasks across all lists`);
  return allTasks;
}

/**
 * Create a new task in a task list
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param title - Task title
 * @param options - Task options including optional accountId for multi-account support
 */
export async function createTask(
  userId: string,
  taskListId: string,
  title: string,
  options?: {
    notes?: string;
    due?: string; // RFC 3339 timestamp (e.g., "2024-12-31T00:00:00Z")
    parent?: string; // Parent task ID for subtasks
    accountId?: string; // Optional specific Google account ID for multi-account support
  }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title,
      notes: options?.notes,
      due: options?.due,
      parent: options?.parent,
    },
  });

  console.log(`[Tasks] Created task "${title}" in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Update an existing task
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param taskId - The task ID
 * @param updates - Fields to update including optional accountId for multi-account support
 */
export async function updateTask(
  userId: string,
  taskListId: string,
  taskId: string,
  updates: {
    title?: string;
    notes?: string;
    due?: string;
    status?: 'needsAction' | 'completed';
    accountId?: string; // Optional specific Google account ID for multi-account support
  }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId, updates.accountId);

  // First get the existing task to merge updates
  const existingResponse = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  const response = await tasks.tasks.update({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      ...existingResponse.data,
      ...updates,
    },
  });

  console.log(`[Tasks] Updated task ${taskId} in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Mark a task as completed
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param taskId - The task ID
 * @param options - Optional settings including accountId for multi-account support
 */
export async function completeTask(
  userId: string,
  taskListId: string,
  taskId: string,
  options?: { accountId?: string }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  // Get existing task first
  const existingResponse = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  const response = await tasks.tasks.update({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      ...existingResponse.data,
      status: 'completed',
    },
  });

  console.log(`[Tasks] Completed task ${taskId} in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Delete a task
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param taskId - The task ID
 * @param options - Optional settings including accountId for multi-account support
 */
export async function deleteTask(
  userId: string,
  taskListId: string,
  taskId: string,
  options?: { accountId?: string }
): Promise<void> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  await tasks.tasks.delete({
    tasklist: taskListId,
    task: taskId,
  });

  console.log(`[Tasks] Deleted task ${taskId} from list ${taskListId}`);
}

/**
 * Create a new task list
 * @param userId - The user ID
 * @param title - Task list title
 * @param options - Optional settings including accountId for multi-account support
 */
export async function createTaskList(
  userId: string,
  title: string,
  options?: { accountId?: string }
): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasklists.insert({
    requestBody: {
      title,
    },
  });

  console.log(`[Tasks] Created task list "${title}"`);
  return mapTaskList(response.data);
}

/**
 * Delete a task list
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param options - Optional settings including accountId for multi-account support
 */
export async function deleteTaskList(
  userId: string,
  taskListId: string,
  options?: { accountId?: string }
): Promise<void> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  await tasks.tasklists.delete({
    tasklist: taskListId,
  });

  console.log(`[Tasks] Deleted task list ${taskListId}`);
}

/**
 * Update a task list (rename)
 * @param userId - The user ID
 * @param taskListId - The task list ID
 * @param title - New title
 * @param options - Optional settings including accountId for multi-account support
 */
export async function updateTaskList(
  userId: string,
  taskListId: string,
  title: string,
  options?: { accountId?: string }
): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId, options?.accountId);

  const response = await tasks.tasklists.update({
    tasklist: taskListId,
    requestBody: {
      id: taskListId,
      title,
    },
  });

  console.log(`[Tasks] Updated task list ${taskListId} to "${title}"`);
  return mapTaskList(response.data);
}
