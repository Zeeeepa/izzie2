import { config } from 'dotenv';
import { execSync } from 'child_process';

// Load environment variables
config({ path: '.env.local' });

console.log('🔌 DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Not set ✗');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env.local');
  process.exit(1);
}

// Run drizzle-kit push with --force to skip prompts
try {
  execSync('npx drizzle-kit push', {
    stdio: 'inherit',
    env: process.env,
    input: '\n', // Send newline for default selection
  });
  console.log('✅ Schema push completed successfully');
} catch (error) {
  console.error('❌ Schema push failed:', error);
  process.exit(1);
}
