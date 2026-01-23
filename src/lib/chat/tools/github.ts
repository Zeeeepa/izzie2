/**
 * GitHub Chat Tools
 * Enables users to manage GitHub issues through the chat interface
 */

import { z } from 'zod';
import { getGitHubTokens } from '@/lib/auth';
import { GitHubService } from '@/lib/services/github';

const LOG_PREFIX = '[GitHub Tools]';

/**
 * Initialize GitHub client with user's OAuth token
 */
async function getGitHubClient(userId: string): Promise<GitHubService> {
  const tokens = await getGitHubTokens(userId);
  if (!tokens || !tokens.accessToken) {
    throw new Error('No GitHub tokens found for user. Please connect your GitHub account.');
  }

  return new GitHubService(tokens.accessToken);
}

/**
 * List GitHub Issues Tool
 * Lists issues from a repository with optional filtering
 */
export const listGithubIssuesToolSchema = z.object({
  owner: z.string().describe('Repository owner (username or organization)'),
  repo: z.string().describe('Repository name'),
  state: z
    .enum(['open', 'closed', 'all'])
    .optional()
    .default('open')
    .describe('Filter by issue state'),
  labels: z
    .string()
    .optional()
    .describe('Comma-separated list of labels to filter by'),
  assignee: z
    .string()
    .optional()
    .describe('Filter by assignee username'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .default(10)
    .describe('Maximum number of issues to return (1-30)'),
});

export type ListGithubIssuesParams = z.infer<typeof listGithubIssuesToolSchema>;

export const listGithubIssuesTool = {
  name: 'list_github_issues',
  description:
    'List GitHub issues from a repository. Can filter by state (open/closed/all), labels, and assignee.',
  parameters: listGithubIssuesToolSchema,

  async execute(
    params: ListGithubIssuesParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = listGithubIssuesToolSchema.parse(params);
      const githubService = await getGitHubClient(userId);

      const result = await githubService.getIssues({
        owner: validated.owner,
        repo: validated.repo,
        state: validated.state,
        labels: validated.labels?.split(',').map((l) => l.trim()),
        assignee: validated.assignee,
        perPage: validated.limit,
      });

      if (result.issues.length === 0) {
        return {
          message: `No ${validated.state} issues found in ${validated.owner}/${validated.repo}.`,
        };
      }

      const issueList = result.issues
        .map((issue) => {
          const labels = issue.labels.map((l) => l.name).join(', ');
          const assignees = issue.assignees.map((a) => a.login).join(', ');
          return `**#${issue.number}** - ${issue.title}\n  State: ${issue.state} | Labels: ${labels || 'none'} | Assignees: ${assignees || 'none'}\n  Created: ${issue.createdAt.toLocaleDateString()}`;
        })
        .join('\n\n');

      let message = `**GitHub Issues for ${validated.owner}/${validated.repo}**\n`;
      message += `Showing ${result.issues.length} ${validated.state} issue(s):\n\n`;
      message += issueList;

      if (result.hasNextPage) {
        message += `\n\n*More issues available. Use a higher limit to see more.*`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} List issues failed:`, error);
      throw new Error(
        `Failed to list GitHub issues: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Create GitHub Issue Tool
 * Creates a new issue in a repository
 */
export const createGithubIssueToolSchema = z.object({
  owner: z.string().describe('Repository owner (username or organization)'),
  repo: z.string().describe('Repository name'),
  title: z.string().describe('Issue title'),
  body: z.string().optional().describe('Issue body/description (supports Markdown)'),
  labels: z
    .string()
    .optional()
    .describe('Comma-separated list of labels to apply'),
  assignees: z
    .string()
    .optional()
    .describe('Comma-separated list of usernames to assign'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed the creation'),
});

export type CreateGithubIssueParams = z.infer<typeof createGithubIssueToolSchema>;

export const createGithubIssueTool = {
  name: 'create_github_issue',
  description:
    'Create a new GitHub issue in a repository. Requires confirmation before creation. Supports labels and assignees.',
  parameters: createGithubIssueToolSchema,

  async execute(
    params: CreateGithubIssueParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = createGithubIssueToolSchema.parse(params);

      if (!validated.confirmed) {
        let preview = `**Please confirm you want to create this GitHub issue:**\n\n`;
        preview += `**Repository:** ${validated.owner}/${validated.repo}\n`;
        preview += `**Title:** ${validated.title}\n`;
        if (validated.body) {
          preview += `**Body:**\n${validated.body}\n\n`;
        }
        if (validated.labels) {
          preview += `**Labels:** ${validated.labels}\n`;
        }
        if (validated.assignees) {
          preview += `**Assignees:** ${validated.assignees}\n`;
        }
        preview += `\nSay "yes, create it" or "confirm" to create this issue.`;

        return { message: preview };
      }

      const githubService = await getGitHubClient(userId);

      const issue = await githubService.createIssue({
        owner: validated.owner,
        repo: validated.repo,
        title: validated.title,
        body: validated.body,
        labels: validated.labels?.split(',').map((l) => l.trim()),
        assignees: validated.assignees?.split(',').map((a) => a.trim()),
      });

      return {
        message: `Issue created successfully!\n\n**#${issue.number}** - ${issue.title}\n${issue.htmlUrl}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Create issue failed:`, error);
      throw new Error(
        `Failed to create GitHub issue: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Update GitHub Issue Tool
 * Updates an existing issue in a repository
 */
export const updateGithubIssueToolSchema = z.object({
  owner: z.string().describe('Repository owner (username or organization)'),
  repo: z.string().describe('Repository name'),
  issueNumber: z.number().int().positive().describe('Issue number to update'),
  title: z.string().optional().describe('New issue title'),
  body: z.string().optional().describe('New issue body/description'),
  state: z
    .enum(['open', 'closed'])
    .optional()
    .describe('Set issue state to open or closed'),
  labels: z
    .string()
    .optional()
    .describe('Comma-separated list of labels (replaces existing labels)'),
  assignees: z
    .string()
    .optional()
    .describe('Comma-separated list of usernames (replaces existing assignees)'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed the update'),
});

export type UpdateGithubIssueParams = z.infer<typeof updateGithubIssueToolSchema>;

export const updateGithubIssueTool = {
  name: 'update_github_issue',
  description:
    'Update an existing GitHub issue. Can modify title, body, state, labels, and assignees. Requires confirmation.',
  parameters: updateGithubIssueToolSchema,

  async execute(
    params: UpdateGithubIssueParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = updateGithubIssueToolSchema.parse(params);
      const githubService = await getGitHubClient(userId);

      // First, fetch the current issue to show what will change
      const currentIssue = await githubService.getIssue(
        validated.owner,
        validated.repo,
        validated.issueNumber
      );

      if (!validated.confirmed) {
        let preview = `**Please confirm you want to update issue #${validated.issueNumber}:**\n\n`;
        preview += `**Current title:** ${currentIssue.title}\n`;

        const changes: string[] = [];
        if (validated.title) {
          changes.push(`Title: "${currentIssue.title}" -> "${validated.title}"`);
        }
        if (validated.body !== undefined) {
          changes.push(`Body: (will be updated)`);
        }
        if (validated.state) {
          changes.push(`State: ${currentIssue.state} -> ${validated.state}`);
        }
        if (validated.labels) {
          const currentLabels = currentIssue.labels.map((l) => l.name).join(', ') || 'none';
          changes.push(`Labels: ${currentLabels} -> ${validated.labels}`);
        }
        if (validated.assignees) {
          const currentAssignees = currentIssue.assignees.map((a) => a.login).join(', ') || 'none';
          changes.push(`Assignees: ${currentAssignees} -> ${validated.assignees}`);
        }

        if (changes.length === 0) {
          return { message: 'No changes specified. Please provide at least one field to update.' };
        }

        preview += `\n**Changes:**\n${changes.map((c) => `- ${c}`).join('\n')}\n`;
        preview += `\nSay "yes, update it" or "confirm" to apply these changes.`;

        return { message: preview };
      }

      const issue = await githubService.updateIssue({
        owner: validated.owner,
        repo: validated.repo,
        issueNumber: validated.issueNumber,
        title: validated.title,
        body: validated.body,
        state: validated.state,
        labels: validated.labels?.split(',').map((l) => l.trim()),
        assignees: validated.assignees?.split(',').map((a) => a.trim()),
      });

      return {
        message: `Issue updated successfully!\n\n**#${issue.number}** - ${issue.title}\nState: ${issue.state}\n${issue.htmlUrl}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Update issue failed:`, error);
      throw new Error(
        `Failed to update GitHub issue: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Add GitHub Comment Tool
 * Adds a comment to an existing issue
 */
export const addGithubCommentToolSchema = z.object({
  owner: z.string().describe('Repository owner (username or organization)'),
  repo: z.string().describe('Repository name'),
  issueNumber: z.number().int().positive().describe('Issue number to comment on'),
  body: z.string().describe('Comment body (supports Markdown)'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed posting the comment'),
});

export type AddGithubCommentParams = z.infer<typeof addGithubCommentToolSchema>;

export const addGithubCommentTool = {
  name: 'add_github_comment',
  description:
    'Add a comment to a GitHub issue. Comments support Markdown formatting. Requires confirmation before posting.',
  parameters: addGithubCommentToolSchema,

  async execute(
    params: AddGithubCommentParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = addGithubCommentToolSchema.parse(params);

      if (!validated.confirmed) {
        let preview = `**Please confirm you want to post this comment:**\n\n`;
        preview += `**Repository:** ${validated.owner}/${validated.repo}\n`;
        preview += `**Issue:** #${validated.issueNumber}\n\n`;
        preview += `**Comment:**\n${validated.body}\n\n`;
        preview += `Say "yes, post it" or "confirm" to add this comment.`;

        return { message: preview };
      }

      const githubService = await getGitHubClient(userId);

      const comment = await githubService.addComment({
        owner: validated.owner,
        repo: validated.repo,
        issueNumber: validated.issueNumber,
        body: validated.body,
      });

      return {
        message: `Comment posted successfully!\n\n${comment.htmlUrl}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Add comment failed:`, error);
      throw new Error(
        `Failed to add GitHub comment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
