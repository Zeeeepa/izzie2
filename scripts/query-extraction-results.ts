/**
 * Query Extraction Results
 *
 * Queries the database to analyze email extraction results:
 * - Total emails synced
 * - Entities extracted by type
 * - Sample entities
 * - Action items
 * - Spam classification stats
 */

import { config } from 'dotenv';
import { dbClient, memoryEntries } from '@/lib/db';
import { sql, desc, and, eq, isNull } from 'drizzle-orm';

// Load environment
config({ path: '.env.local' });

interface EntityStats {
  type: string;
  count: number;
}

interface SpamStats {
  total: number;
  spam: number;
  notSpam: number;
  spamPercentage: number;
}

async function queryExtractionResults() {
  console.log('📊 Email Extraction Results Report\n');
  console.log('=' .repeat(60));

  try {
    // Initialize database
    const db = dbClient.getDb();

    // 1. Count total memory entries (emails + drive docs)
    const totalEntries = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memoryEntries)
      .where(and(
        eq(memoryEntries.isDeleted, false),
        isNull(memoryEntries.conversationId) // Not part of a conversation
      ));

    const total = totalEntries[0]?.count || 0;
    console.log(`\n1️⃣  Total Entries Synced: ${total}`);

    // 2. Count entries by source type
    const bySource = await db
      .select({
        source: sql<string>`metadata->>'source'`,
        count: sql<number>`count(*)::int`,
      })
      .from(memoryEntries)
      .where(eq(memoryEntries.isDeleted, false))
      .groupBy(sql`metadata->>'source'`);

    console.log('\n📧 Entries by Source:');
    bySource.forEach(({ source, count }) => {
      console.log(`  ${source || 'unknown'}: ${count}`);
    });

    // 3. Extract entity statistics from metadata
    const allEntries = await db
      .select({
        id: memoryEntries.id,
        metadata: memoryEntries.metadata,
        content: memoryEntries.content,
        createdAt: memoryEntries.createdAt,
      })
      .from(memoryEntries)
      .where(eq(memoryEntries.isDeleted, false))
      .orderBy(desc(memoryEntries.createdAt))
      .limit(1000); // Limit to recent entries

    console.log(`\n📝 Analyzing ${allEntries.length} recent entries...`);

    // Count entities by type
    const entityCounts = new Map<string, number>();
    const sampleEntities = new Map<string, any[]>();
    const actionItems: any[] = [];
    let spamCount = 0;
    let notSpamCount = 0;
    let totalWithSpamInfo = 0;

    for (const entry of allEntries) {
      const metadata = entry.metadata as any;

      // Count entities by type
      if (metadata?.entities && Array.isArray(metadata.entities)) {
        for (const entity of metadata.entities) {
          const type = entity.type || 'unknown';
          entityCounts.set(type, (entityCounts.get(type) || 0) + 1);

          // Collect sample entities (first 3 of each type)
          if (!sampleEntities.has(type)) {
            sampleEntities.set(type, []);
          }
          if (sampleEntities.get(type)!.length < 3) {
            sampleEntities.get(type)!.push({
              value: entity.value,
              normalized: entity.normalized,
              confidence: entity.confidence,
              source: entity.source,
            });
          }

          // Collect action items
          if (type === 'action_item') {
            actionItems.push({
              text: entity.value,
              emailId: entry.id,
              date: entry.createdAt,
            });
          }
        }
      }

      // Count spam classifications
      if (metadata?.spam) {
        totalWithSpamInfo++;
        if (metadata.spam.isSpam) {
          spamCount++;
        } else {
          notSpamCount++;
        }
      }
    }

    // 4. Display entity breakdown
    console.log('\n2️⃣  Entities by Type:');
    const sortedEntities = Array.from(entityCounts.entries()).sort((a, b) => b[1] - a[1]);
    let totalEntities = 0;
    sortedEntities.forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
      totalEntities += count;
    });
    console.log(`  TOTAL: ${totalEntities} entities`);

    // 5. Display sample entities
    console.log('\n3️⃣  Sample Entities (Top 10):');
    const topTypes = sortedEntities.slice(0, 10);
    topTypes.forEach(([type]) => {
      const samples = sampleEntities.get(type) || [];
      console.log(`\n  ${type.toUpperCase()}:`);
      samples.forEach((entity, idx) => {
        console.log(`    ${idx + 1}. "${entity.value}" (confidence: ${(entity.confidence * 100).toFixed(0)}%)`);
      });
    });

    // 6. Display action items
    console.log('\n4️⃣  Action Items Found:');
    if (actionItems.length === 0) {
      console.log('  No action items extracted');
    } else {
      const recentActions = actionItems.slice(0, 10);
      recentActions.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.text}`);
        console.log(`     (from: ${item.emailId.substring(0, 8)}... on ${item.date.toLocaleDateString()})`);
      });
      if (actionItems.length > 10) {
        console.log(`  ... and ${actionItems.length - 10} more`);
      }
    }

    // 7. Display spam statistics
    console.log('\n5️⃣  Spam Classification Summary:');
    console.log(`  Total entries with spam info: ${totalWithSpamInfo}`);
    console.log(`  Marked as spam: ${spamCount}`);
    console.log(`  Not spam: ${notSpamCount}`);
    if (totalWithSpamInfo > 0) {
      const spamPercentage = ((spamCount / totalWithSpamInfo) * 100).toFixed(1);
      console.log(`  Spam rate: ${spamPercentage}%`);
    }

    // 8. Display top entries by importance
    console.log('\n6️⃣  Top 5 High-Importance Entries:');
    const topImportant = await db
      .select({
        id: memoryEntries.id,
        content: memoryEntries.content,
        importance: memoryEntries.importance,
        metadata: memoryEntries.metadata,
      })
      .from(memoryEntries)
      .where(eq(memoryEntries.isDeleted, false))
      .orderBy(desc(memoryEntries.importance))
      .limit(5);

    topImportant.forEach((entry, idx) => {
      const metadata = entry.metadata as any;
      const source = metadata?.source || 'unknown';
      const preview = entry.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(`  ${idx + 1}. [Importance: ${entry.importance}] [${source}]`);
      console.log(`     ${preview}...`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Report Complete\n');

  } catch (error) {
    console.error('❌ Error querying database:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the query
queryExtractionResults();
