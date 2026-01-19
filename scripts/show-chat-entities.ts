/**
 * Show what entities the chatbot would find
 * Demonstrates the data is ready for chatbot queries
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { dbClient } from '../src/lib/db';
import { memoryEntries } from '../src/lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = dbClient.getDb();

  console.log('\n=== Chatbot Entity Data ===\n');

  // Get all memory entries with entities
  const results = await db
    .select()
    .from(memoryEntries)
    .where(sql`${memoryEntries.metadata}->>'entities' IS NOT NULL`)
    .limit(50);

  console.log(`Found ${results.length} memory entries with entities\n`);

  // Extract and categorize all entities
  const allEntities: any[] = [];
  const byType: Record<string, any[]> = {};

  results.forEach((entry) => {
    const metadata = entry.metadata as any;
    const entities = metadata?.entities || [];

    entities.forEach((entity: any) => {
      allEntities.push(entity);

      if (!byType[entity.type]) {
        byType[entity.type] = [];
      }

      // Check if already exists (deduplicate by normalized value)
      const exists = byType[entity.type].some(
        (e) => e.normalized === entity.normalized
      );

      if (!exists) {
        byType[entity.type].push(entity);
      }
    });
  });

  console.log(`Total entities extracted: ${allEntities.length}`);
  console.log(`Unique entities: ${Object.values(byType).flat().length}\n`);

  // Display by type
  console.log('📊 Entities Available for Chat:\n');

  Object.entries(byType)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([type, entities]) => {
      console.log(`\n${type.toUpperCase()} (${entities.length}):`);

      entities.slice(0, 10).forEach((entity) => {
        const context = entity.context ? ` - ${entity.context}` : '';
        console.log(`  • ${entity.value}${context}`);
      });

      if (entities.length > 10) {
        console.log(`  ... and ${entities.length - 10} more`);
      }
    });

  // Example queries
  console.log('\n\n=== Example Chat Queries ===\n');

  const examples = [
    {
      query: "Who have I been emailing?",
      answer: `Would find ${byType['person']?.length || 0} people from your emails`,
    },
    {
      query: "What companies am I working with?",
      answer: `Would find ${byType['company']?.length || 0} companies mentioned`,
    },
    {
      query: "What action items do I have?",
      answer: `Would find ${byType['action_item']?.length || 0} action items`,
    },
    {
      query: "Tell me about my projects",
      answer: `Would find ${byType['project']?.length || 0} projects`,
    },
    {
      query: "What topics have I discussed?",
      answer: `Would find ${byType['topic']?.length || 0} topics`,
    },
  ];

  examples.forEach((example) => {
    console.log(`Q: "${example.query}"`);
    console.log(`A: ${example.answer}\n`);
  });

  console.log('=== How to Test ===\n');
  console.log('1. Open browser: http://localhost:3300');
  console.log('2. Log in as: bob@matsuoka.com');
  console.log('3. Go to chat: http://localhost:3300/dashboard/chat');
  console.log('4. Try any of the example queries above');
  console.log('\n✅ The chatbot will search these entities and provide intelligent answers!\n');

  process.exit(0);
}

main().catch(console.error);
