/**
 * Database operations for research tasks
 * Complements Weaviate with relational storage for sources and findings
 */

import { dbClient } from './client';
import { researchSources, researchFindings } from './schema';
import { eq, and, desc } from 'drizzle-orm';
import type { ResearchSource, ResearchFinding } from '@/agents/base/types';

const LOG_PREFIX = '[DB Research]';

/**
 * Save a research source to the database
 */
export async function saveResearchSource(source: {
  taskId: string;
  url: string;
  title?: string;
  content?: string;
  contentType?: string;
  relevanceScore?: number;
  credibilityScore?: number;
  fetchStatus?: 'pending' | 'fetched' | 'failed';
  fetchError?: string;
  fetchedAt?: Date;
  expiresAt?: Date;
}): Promise<string> {
  const db = dbClient.getDb();

  try {
    const [inserted] = await db
      .insert(researchSources)
      .values({
        taskId: source.taskId,
        url: source.url,
        title: source.title || null,
        content: source.content || null,
        contentType: source.contentType || null,
        relevanceScore: source.relevanceScore || null,
        credibilityScore: source.credibilityScore || null,
        fetchStatus: source.fetchStatus || 'pending',
        fetchError: source.fetchError || null,
        fetchedAt: source.fetchedAt || null,
        expiresAt: source.expiresAt || null,
      })
      .returning({ id: researchSources.id });

    console.log(`${LOG_PREFIX} Saved source: ${source.url}`);
    return inserted.id;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save source:`, error);
    throw error;
  }
}

/**
 * Save multiple research sources in batch
 */
export async function saveResearchSources(
  sources: Array<{
    taskId: string;
    url: string;
    title?: string;
    content?: string;
    contentType?: string;
    relevanceScore?: number;
    credibilityScore?: number;
    fetchStatus?: 'pending' | 'fetched' | 'failed';
    fetchError?: string;
    fetchedAt?: Date;
  }>
): Promise<string[]> {
  if (sources.length === 0) {
    return [];
  }

  const db = dbClient.getDb();

  try {
    const inserted = await db
      .insert(researchSources)
      .values(
        sources.map((source) => ({
          taskId: source.taskId,
          url: source.url,
          title: source.title || null,
          content: source.content || null,
          contentType: source.contentType || null,
          relevanceScore: source.relevanceScore || null,
          credibilityScore: source.credibilityScore || null,
          fetchStatus: source.fetchStatus || 'pending',
          fetchError: source.fetchError || null,
          fetchedAt: source.fetchedAt || null,
        }))
      )
      .returning({ id: researchSources.id });

    console.log(`${LOG_PREFIX} Saved ${inserted.length} sources`);
    return inserted.map((row) => row.id);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save sources:`, error);
    throw error;
  }
}

/**
 * Update a research source
 */
export async function updateResearchSource(
  sourceId: string,
  updates: {
    title?: string;
    content?: string;
    relevanceScore?: number;
    credibilityScore?: number;
    fetchStatus?: 'pending' | 'fetched' | 'failed';
    fetchError?: string;
    fetchedAt?: Date;
  }
): Promise<void> {
  const db = dbClient.getDb();

  try {
    await db
      .update(researchSources)
      .set({
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.content !== undefined && { content: updates.content }),
        ...(updates.relevanceScore !== undefined && { relevanceScore: updates.relevanceScore }),
        ...(updates.credibilityScore !== undefined && {
          credibilityScore: updates.credibilityScore,
        }),
        ...(updates.fetchStatus !== undefined && { fetchStatus: updates.fetchStatus }),
        ...(updates.fetchError !== undefined && { fetchError: updates.fetchError }),
        ...(updates.fetchedAt !== undefined && { fetchedAt: updates.fetchedAt }),
      })
      .where(eq(researchSources.id, sourceId));

    console.log(`${LOG_PREFIX} Updated source ${sourceId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to update source:`, error);
    throw error;
  }
}

/**
 * Get research sources for a task
 */
export async function getResearchSources(taskId: string): Promise<ResearchSource[]> {
  const db = dbClient.getDb();

  try {
    const sources = await db
      .select()
      .from(researchSources)
      .where(eq(researchSources.taskId, taskId))
      .orderBy(desc(researchSources.createdAt));

    console.log(`${LOG_PREFIX} Found ${sources.length} sources for task ${taskId}`);
    return sources as ResearchSource[];
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get sources:`, error);
    return [];
  }
}

/**
 * Get a single research source by ID
 */
export async function getResearchSourceById(sourceId: string): Promise<ResearchSource | null> {
  const db = dbClient.getDb();

  try {
    const [source] = await db
      .select()
      .from(researchSources)
      .where(eq(researchSources.id, sourceId))
      .limit(1);

    return (source as ResearchSource) || null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get source:`, error);
    return null;
  }
}

/**
 * Save a research finding to the database
 */
export async function saveResearchFinding(finding: {
  taskId: string;
  sourceId?: string;
  claim: string;
  evidence?: string;
  confidence: number;
  citation?: string;
  quote?: string;
}): Promise<string> {
  const db = dbClient.getDb();

  try {
    const [inserted] = await db
      .insert(researchFindings)
      .values({
        taskId: finding.taskId,
        sourceId: finding.sourceId || null,
        claim: finding.claim,
        evidence: finding.evidence || null,
        confidence: Math.round(finding.confidence * 100), // Convert 0-1 to 0-100
        citation: finding.citation || null,
        quote: finding.quote || null,
      })
      .returning({ id: researchFindings.id });

    console.log(`${LOG_PREFIX} Saved finding: "${finding.claim.substring(0, 50)}..."`);
    return inserted.id;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save finding:`, error);
    throw error;
  }
}

/**
 * Save multiple research findings in batch
 */
export async function saveResearchFindings(
  findings: Array<{
    taskId: string;
    sourceId?: string;
    claim: string;
    evidence?: string;
    confidence: number;
    citation?: string;
    quote?: string;
  }>
): Promise<string[]> {
  if (findings.length === 0) {
    return [];
  }

  const db = dbClient.getDb();

  try {
    const inserted = await db
      .insert(researchFindings)
      .values(
        findings.map((finding) => ({
          taskId: finding.taskId,
          sourceId: finding.sourceId || null,
          claim: finding.claim,
          evidence: finding.evidence || null,
          confidence: Math.round(finding.confidence * 100),
          citation: finding.citation || null,
          quote: finding.quote || null,
        }))
      )
      .returning({ id: researchFindings.id });

    console.log(`${LOG_PREFIX} Saved ${inserted.length} findings`);
    return inserted.map((row) => row.id);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save findings:`, error);
    throw error;
  }
}

/**
 * Get research findings for a task
 */
export async function getResearchFindings(taskId: string): Promise<ResearchFinding[]> {
  const db = dbClient.getDb();

  try {
    const findings = await db
      .select()
      .from(researchFindings)
      .where(eq(researchFindings.taskId, taskId))
      .orderBy(desc(researchFindings.confidence));

    console.log(`${LOG_PREFIX} Found ${findings.length} findings for task ${taskId}`);
    return findings.map((f) => ({
      ...f,
      confidence: f.confidence / 100, // Convert back to 0-1
    })) as ResearchFinding[];
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get findings:`, error);
    return [];
  }
}

/**
 * Delete all research data (sources and findings) for a task
 */
export async function deleteResearchData(taskId: string): Promise<void> {
  const db = dbClient.getDb();

  try {
    // Delete findings first (foreign key constraint)
    await db.delete(researchFindings).where(eq(researchFindings.taskId, taskId));

    // Then delete sources
    await db.delete(researchSources).where(eq(researchSources.taskId, taskId));

    console.log(`${LOG_PREFIX} Deleted all research data for task ${taskId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete research data:`, error);
    throw error;
  }
}
