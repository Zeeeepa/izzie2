/**
 * GitHub Service
 * Handles issue management, comments, and repository interactions
 */

import { Octokit } from '@octokit/rest';

// Types
export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  dueOn?: Date;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  milestone?: GitHubMilestone;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  htmlUrl: string;
  commentsCount: number;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  createdAt: Date;
  updatedAt: Date;
  htmlUrl: string;
}

export interface GetIssuesOptions {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  assignee?: string;
  creator?: string;
  milestone?: string | number;
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  since?: Date;
  perPage?: number;
  page?: number;
}

export interface CreateIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

export interface AddCommentOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface IssueBatch {
  issues: GitHubIssue[];
  hasNextPage: boolean;
  totalCount?: number;
}

const RATE_LIMIT_DELAY_MS = 100;

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Get issues with filtering and pagination
   */
  async getIssues(options: GetIssuesOptions): Promise<IssueBatch> {
    const {
      owner,
      repo,
      state = 'open',
      labels,
      assignee,
      creator,
      milestone,
      sort = 'created',
      direction = 'desc',
      since,
      perPage = 30,
      page = 1,
    } = options;

    try {
      const response = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state,
        labels: labels?.join(','),
        assignee,
        creator,
        milestone: milestone?.toString(),
        sort,
        direction,
        since: since?.toISOString(),
        per_page: perPage,
        page,
      });

      const issues = response.data
        .filter((issue) => !issue.pull_request) // Exclude PRs
        .map((issue) => this.parseIssue(issue));

      // Check if there's a next page via Link header
      const linkHeader = response.headers.link || '';
      const hasNextPage = linkHeader.includes('rel="next"');

      return {
        issues,
        hasNextPage,
      };
    } catch (error) {
      console.error('[GitHub] Failed to get issues:', error);
      throw new Error(`Failed to get issues: ${error}`);
    }
  }

  /**
   * Get a single issue by number
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      return this.parseIssue(response.data);
    } catch (error) {
      console.error(`[GitHub] Failed to get issue #${issueNumber}:`, error);
      throw new Error(`Failed to get issue #${issueNumber}: ${error}`);
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(options: CreateIssueOptions): Promise<GitHubIssue> {
    const { owner, repo, title, body, assignees, labels, milestone } = options;

    try {
      const response = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
        assignees,
        labels,
        milestone,
      });

      return this.parseIssue(response.data);
    } catch (error) {
      console.error('[GitHub] Failed to create issue:', error);
      throw new Error(`Failed to create issue: ${error}`);
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(options: UpdateIssueOptions): Promise<GitHubIssue> {
    const {
      owner,
      repo,
      issueNumber,
      title,
      body,
      state,
      assignees,
      labels,
      milestone,
    } = options;

    try {
      const response = await this.octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title,
        body,
        state,
        assignees,
        labels,
        milestone: milestone === null ? null : milestone,
      });

      return this.parseIssue(response.data);
    } catch (error) {
      console.error(`[GitHub] Failed to update issue #${issueNumber}:`, error);
      throw new Error(`Failed to update issue #${issueNumber}: ${error}`);
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(options: AddCommentOptions): Promise<GitHubComment> {
    const { owner, repo, issueNumber, body } = options;

    try {
      const response = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      return this.parseComment(response.data);
    } catch (error) {
      console.error(
        `[GitHub] Failed to add comment to issue #${issueNumber}:`,
        error
      );
      throw new Error(`Failed to add comment: ${error}`);
    }
  }

  /**
   * Get comments for an issue
   */
  async getComments(
    owner: string,
    repo: string,
    issueNumber: number,
    perPage: number = 30,
    page: number = 1
  ): Promise<{ comments: GitHubComment[]; hasNextPage: boolean }> {
    try {
      const response = await this.octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: perPage,
        page,
      });

      const comments = response.data.map((comment) =>
        this.parseComment(comment)
      );

      const linkHeader = response.headers.link || '';
      const hasNextPage = linkHeader.includes('rel="next"');

      return { comments, hasNextPage };
    } catch (error) {
      console.error(
        `[GitHub] Failed to get comments for issue #${issueNumber}:`,
        error
      );
      throw new Error(`Failed to get comments: ${error}`);
    }
  }

  /**
   * Get available labels for a repository
   */
  async getLabels(
    owner: string,
    repo: string
  ): Promise<GitHubLabel[]> {
    try {
      const response = await this.octokit.issues.listLabelsForRepo({
        owner,
        repo,
        per_page: 100,
      });

      return response.data.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description || undefined,
      }));
    } catch (error) {
      console.error('[GitHub] Failed to get labels:', error);
      throw new Error(`Failed to get labels: ${error}`);
    }
  }

  /**
   * Get milestones for a repository
   */
  async getMilestones(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<GitHubMilestone[]> {
    try {
      const response = await this.octokit.issues.listMilestones({
        owner,
        repo,
        state,
        per_page: 100,
      });

      return response.data.map((milestone) => ({
        id: milestone.id,
        number: milestone.number,
        title: milestone.title,
        description: milestone.description || undefined,
        state: milestone.state as 'open' | 'closed',
        dueOn: milestone.due_on ? new Date(milestone.due_on) : undefined,
      }));
    } catch (error) {
      console.error('[GitHub] Failed to get milestones:', error);
      throw new Error(`Failed to get milestones: ${error}`);
    }
  }

  /**
   * Batch fetch multiple issues by numbers
   */
  async batchFetch(
    owner: string,
    repo: string,
    issueNumbers: number[]
  ): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];

    for (const issueNumber of issueNumbers) {
      try {
        const issue = await this.getIssue(owner, repo, issueNumber);
        issues.push(issue);
        await this.sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(
          `[GitHub] Failed to fetch issue #${issueNumber} in batch:`,
          error
        );
        // Continue with other issues
      }
    }

    return issues;
  }

  /**
   * Parse GitHub API issue response into GitHubIssue type
   */
  private parseIssue(
    issue: Awaited<
      ReturnType<typeof this.octokit.issues.get>
    >['data']
  ): GitHubIssue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      state: issue.state as 'open' | 'closed',
      user: this.parseUser(issue.user),
      assignees: (issue.assignees || []).map((a) => this.parseUser(a)),
      labels: (issue.labels || []).map((label) => {
        if (typeof label === 'string') {
          return { id: 0, name: label, color: '' };
        }
        return {
          id: label.id || 0,
          name: label.name || '',
          color: label.color || '',
          description: label.description || undefined,
        };
      }),
      milestone: issue.milestone
        ? {
            id: issue.milestone.id,
            number: issue.milestone.number,
            title: issue.milestone.title,
            description: issue.milestone.description || undefined,
            state: issue.milestone.state as 'open' | 'closed',
            dueOn: issue.milestone.due_on
              ? new Date(issue.milestone.due_on)
              : undefined,
          }
        : undefined,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
      htmlUrl: issue.html_url,
      commentsCount: issue.comments,
    };
  }

  /**
   * Parse GitHub API user response
   */
  private parseUser(
    user: { id: number; login: string; avatar_url?: string } | null
  ): GitHubUser {
    if (!user) {
      return { id: 0, login: 'unknown' };
    }
    return {
      id: user.id,
      login: user.login,
      avatarUrl: user.avatar_url,
    };
  }

  /**
   * Parse GitHub API comment response
   */
  private parseComment(
    comment: Awaited<
      ReturnType<typeof this.octokit.issues.getComment>
    >['data']
  ): GitHubComment {
    return {
      id: comment.id,
      body: comment.body || '',
      user: this.parseUser(comment.user),
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at),
      htmlUrl: comment.html_url,
    };
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance management
 */
let githubServiceInstance: GitHubService | null = null;

export function getGitHubService(token?: string): GitHubService {
  if (!githubServiceInstance || token) {
    if (!token) {
      throw new Error('OAuth token required to initialize GitHub service');
    }
    githubServiceInstance = new GitHubService(token);
  }
  return githubServiceInstance;
}
