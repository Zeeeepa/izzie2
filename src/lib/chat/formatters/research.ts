/**
 * Research Results Formatter
 * Formats ResearchOutput for display in chat
 */

import type { ResearchOutput } from '@/agents/research/types';

/**
 * Format research results as markdown for chat display
 * @param output - Research output from ResearchAgent
 * @returns Formatted markdown string
 */
export function formatResearchResults(output: ResearchOutput): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Research Results\n`);

  // Summary
  if (output.summary) {
    sections.push(`## Summary\n\n${output.summary}\n`);
  }

  // Key Findings
  if (output.findings && output.findings.length > 0) {
    sections.push(`## Key Findings\n`);

    output.findings.forEach((finding, index) => {
      const confidence = Math.round((finding.confidence || 0) * 100);
      sections.push(
        `${index + 1}. **${finding.claim}**\n   - Evidence: ${finding.evidence}\n   - Confidence: ${confidence}%\n   - Source: [${finding.sourceTitle || 'View source'}](${finding.sourceUrl})\n`
      );
    });

    sections.push('');
  }

  // Sources
  if (output.sources && output.sources.length > 0) {
    sections.push(`## Sources\n`);

    output.sources.forEach((source, index) => {
      const relevance = Math.round((source.relevanceScore || 0) * 100);
      const credibility = Math.round((source.credibilityScore || 0) * 100);

      sections.push(
        `${index + 1}. [${source.title || source.url}](${source.url})\n   - Relevance: ${relevance}% | Credibility: ${credibility}%\n`
      );
    });

    sections.push('');
  }

  // Metadata
  if (output.metadata) {
    const tokensUsed = output.metadata.tokensUsed || 0;
    const totalCost = output.metadata.totalCost || 0;
    const sourcesAnalyzed = output.metadata.sourcesAnalyzed || 0;

    sections.push(`## Research Statistics\n`);
    sections.push(`- Sources analyzed: ${sourcesAnalyzed}`);
    sections.push(`- Tokens used: ${tokensUsed.toLocaleString()}`);
    sections.push(`- Total cost: $${(totalCost / 100).toFixed(4)}\n`);
  }

  return sections.join('\n');
}

/**
 * Format research task status for chat display
 * @param task - Task object with status and progress
 * @returns Formatted status string
 */
export function formatResearchStatus(task: {
  id: string;
  status: string;
  progress: number;
  currentStep?: string | null;
}): string {
  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    paused: '⏸️',
  };

  const emoji = statusEmoji[task.status] || '📝';
  const progressBar = generateProgressBar(task.progress);

  if (task.status === 'running' && task.currentStep) {
    return `${emoji} **Research in progress** (${task.progress}%)\n${progressBar}\n📍 Current step: ${task.currentStep}`;
  }

  if (task.status === 'completed') {
    return `${emoji} **Research completed!** View full results below.`;
  }

  if (task.status === 'failed') {
    return `${emoji} **Research failed.** Please try again or refine your query.`;
  }

  if (task.status === 'paused') {
    return `${emoji} **Research paused.** Use /resume to continue.`;
  }

  return `${emoji} **Research ${task.status}** (${task.progress}%)`;
}

/**
 * Generate a simple text progress bar
 * @param progress - Progress percentage (0-100)
 * @returns ASCII progress bar
 */
function generateProgressBar(progress: number, length: number = 20): string {
  const filled = Math.round((progress / 100) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
}

/**
 * Format research error for chat display
 * @param error - Error message
 * @returns Formatted error string
 */
export function formatResearchError(error: string): string {
  return `❌ **Research failed:**\n\n${error}\n\nPlease try again with a different query or contact support if the issue persists.`;
}
