/**
 * Check current extraction statuses
 */

import { dbClient } from '../src/lib/db/client.js';
import { extractionProgress } from '../src/lib/db/schema.js';

async function checkStatus() {
  try {
    console.log('Checking extraction statuses...\n');

    const db = await dbClient.getDb();

    // Get all extraction progress records
    const all = await db.select().from(extractionProgress);

    if (all.length === 0) {
      console.log('No extraction progress records found.');
      return;
    }

    console.log(`Found ${all.length} extraction record(s):\n`);

    all.forEach((record) => {
      console.log(`Source: ${record.source}`);
      console.log(`  Status: ${record.status}`);
      console.log(`  Total Items: ${record.totalItems || 0}`);
      console.log(`  Processed: ${record.processedItems || 0}`);
      console.log(`  Failed: ${record.failedItems || 0}`);
      console.log(`  Entities: ${record.entitiesExtracted || 0}`);
      console.log(`  Last Run: ${record.lastRunAt || 'Never'}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error checking status:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkStatus();
