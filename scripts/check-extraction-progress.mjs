import { dbClient } from './src/lib/db/index.js';
import { extractionProgress } from './src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

const db = dbClient.getDb();
const progress = await db.select().from(extractionProgress).where(eq(extractionProgress.source, 'email'));
console.log(JSON.stringify(progress, null, 2));
process.exit(0);
