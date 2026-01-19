/**
 * QA Script: Sample and Analyze Weaviate Entity Quality
 *
 * Fetches sample entities from each collection to assess extraction quality.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getWeaviateClient } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[QA Weaviate]';

interface EntitySample {
  type: EntityType;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  context: string;
  sourceId: string;
  userId: string;
  extractedAt: string;
  // Action item specific
  assignee?: string;
  deadline?: string;
  priority?: string;
}

/**
 * Get sample entities from a collection
 */
async function getSampleEntities(
  collectionName: string,
  entityType: EntityType,
  limit: number = 20
): Promise<EntitySample[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(collectionName);

  const baseProps = [
    'value',
    'normalized',
    'confidence',
    'source',
    'context',
    'sourceId',
    'userId',
    'extractedAt',
  ];

  const props =
    entityType === 'action_item'
      ? [...baseProps, 'assignee', 'deadline', 'priority']
      : baseProps;

  const result = await collection.query.fetchObjects({
    limit,
    returnProperties: props,
  });

  return result.objects.map((obj: any) => ({
    type: entityType,
    value: obj.properties.value,
    normalized: obj.properties.normalized,
    confidence: obj.properties.confidence,
    source: obj.properties.source,
    context: obj.properties.context,
    sourceId: obj.properties.sourceId,
    userId: obj.properties.userId,
    extractedAt: obj.properties.extractedAt,
    ...(entityType === 'action_item' && {
      assignee: obj.properties.assignee,
      deadline: obj.properties.deadline,
      priority: obj.properties.priority,
    }),
  }));
}

/**
 * Get entity count from collection
 */
async function getEntityCount(collectionName: string): Promise<number> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(collectionName);

  const result = await collection.aggregate.overAll();
  return result.totalCount || 0;
}

/**
 * Analyze entity quality patterns
 */
function analyzeEntityQuality(samples: EntitySample[]): {
  avgConfidence: number;
  lowConfidenceCount: number;
  duplicates: string[];
  shortValues: string[];
  emptyNormalized: number;
  emptyContext: number;
  sourceDistribution: Record<string, number>;
} {
  const confidences = samples.map((s) => s.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const lowConfidenceCount = samples.filter((s) => s.confidence < 0.7).length;

  // Detect duplicates
  const normalizedMap = new Map<string, number>();
  samples.forEach((s) => {
    normalizedMap.set(s.normalized, (normalizedMap.get(s.normalized) || 0) + 1);
  });
  const duplicates = Array.from(normalizedMap.entries())
    .filter(([_, count]) => count > 1)
    .map(([normalized]) => normalized);

  // Detect very short values (potential false positives)
  const shortValues = samples.filter((s) => s.value.length <= 2).map((s) => s.value);

  // Empty field tracking
  const emptyNormalized = samples.filter((s) => !s.normalized || s.normalized === '').length;
  const emptyContext = samples.filter((s) => !s.context || s.context === '').length;

  // Source distribution
  const sourceDistribution: Record<string, number> = {};
  samples.forEach((s) => {
    sourceDistribution[s.source] = (sourceDistribution[s.source] || 0) + 1;
  });

  return {
    avgConfidence,
    lowConfidenceCount,
    duplicates,
    shortValues,
    emptyNormalized,
    emptyContext,
    sourceDistribution,
  };
}

/**
 * Main QA execution
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Weaviate Entity Quality Assessment`);
  console.log(`${'='.repeat(80)}\n`);

  const entityTypes: EntityType[] = [
    'person',
    'company',
    'project',
    'topic',
    'action_item',
    'location',
    'date',
  ];

  const report: Record<string, any> = {};

  for (const entityType of entityTypes) {
    const collectionName = COLLECTIONS[entityType];

    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${LOG_PREFIX} Analyzing: ${entityType.toUpperCase()}`);
    console.log(`${'-'.repeat(80)}\n`);

    try {
      // Get total count
      const totalCount = await getEntityCount(collectionName);
      console.log(`  📊 Total count: ${totalCount}`);

      if (totalCount === 0) {
        console.log(`  ⚠️  No entities found in ${collectionName}\n`);
        report[entityType] = {
          totalCount: 0,
          samples: [],
          analysis: null,
        };
        continue;
      }

      // Get samples
      const sampleSize = Math.min(30, totalCount);
      const samples = await getSampleEntities(collectionName, entityType, sampleSize);

      console.log(`  📋 Sample size: ${samples.length}\n`);

      // Show some samples
      console.log(`  🔍 Sample Entities (first 10):`);
      samples.slice(0, 10).forEach((entity, idx) => {
        console.log(
          `    ${idx + 1}. "${entity.value}" → normalized: "${entity.normalized}" (confidence: ${entity.confidence.toFixed(2)}, source: ${entity.source})`
        );
        if (entity.context) {
          console.log(`       Context: "${entity.context.substring(0, 80)}..."`);
        }
        if (entityType === 'action_item') {
          console.log(
            `       Assignee: ${entity.assignee || 'N/A'}, Deadline: ${entity.deadline || 'N/A'}, Priority: ${entity.priority || 'N/A'}`
          );
        }
      });

      // Quality analysis
      const analysis = analyzeEntityQuality(samples);

      console.log(`\n  📈 Quality Metrics:`);
      console.log(`    Average Confidence: ${(analysis.avgConfidence * 100).toFixed(1)}%`);
      console.log(
        `    Low Confidence (<70%): ${analysis.lowConfidenceCount}/${samples.length} (${((analysis.lowConfidenceCount / samples.length) * 100).toFixed(1)}%)`
      );
      console.log(`    Duplicates (in sample): ${analysis.duplicates.length}`);
      if (analysis.duplicates.length > 0) {
        console.log(`      Examples: ${analysis.duplicates.slice(0, 5).join(', ')}`);
      }
      console.log(`    Very Short Values: ${analysis.shortValues.length}`);
      if (analysis.shortValues.length > 0) {
        console.log(`      Examples: ${analysis.shortValues.slice(0, 10).join(', ')}`);
      }
      console.log(
        `    Empty Normalized: ${analysis.emptyNormalized}/${samples.length} (${((analysis.emptyNormalized / samples.length) * 100).toFixed(1)}%)`
      );
      console.log(
        `    Empty Context: ${analysis.emptyContext}/${samples.length} (${((analysis.emptyContext / samples.length) * 100).toFixed(1)}%)`
      );

      console.log(`\n  📊 Source Distribution:`);
      Object.entries(analysis.sourceDistribution).forEach(([source, count]) => {
        console.log(
          `    ${source}: ${count} (${((count / samples.length) * 100).toFixed(1)}%)`
        );
      });

      // Store in report
      report[entityType] = {
        totalCount,
        sampleSize: samples.length,
        samples: samples.slice(0, 15), // Save top 15 for report
        analysis,
      };
    } catch (error) {
      console.error(`  ❌ Failed to analyze ${entityType}:`, error);
      report[entityType] = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Final Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Summary Report`);
  console.log(`${'='.repeat(80)}\n`);

  const totalEntities = Object.values(report).reduce(
    (sum: number, r: any) => sum + (r.totalCount || 0),
    0
  );
  console.log(`  📊 Total Entities Across All Types: ${totalEntities}\n`);

  console.log(`  Entity Type Distribution:`);
  entityTypes.forEach((type) => {
    const count = report[type]?.totalCount || 0;
    const percentage = totalEntities > 0 ? ((count / totalEntities) * 100).toFixed(1) : '0.0';
    console.log(`    ${type.padEnd(15)}: ${count.toString().padStart(4)} (${percentage}%)`);
  });

  console.log(`\n  Average Confidence by Type:`);
  entityTypes.forEach((type) => {
    const avgConf = report[type]?.analysis?.avgConfidence;
    if (avgConf !== undefined) {
      console.log(`    ${type.padEnd(15)}: ${(avgConf * 100).toFixed(1)}%`);
    }
  });

  // Export detailed report to JSON
  const reportPath = path.resolve(process.cwd(), 'weaviate-qa-report.json');
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  💾 Detailed report saved to: ${reportPath}`);

  console.log(`\n${'='.repeat(80)}\n`);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} Fatal error:`, error);
  process.exit(1);
});
