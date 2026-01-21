/**
 * Safe Vercel env pull: backup first, then pull, then validate
 * Usage: pnpm env:pull
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync, spawnSync } from 'child_process';

const ENV_FILE = '.env.local';

function backup(): boolean {
  const envPath = join(process.cwd(), ENV_FILE);

  if (existsSync(envPath)) {
    console.log('Backing up existing .env.local...');
    try {
      execSync('pnpm env:backup', { stdio: 'inherit' });
      return true;
    } catch {
      console.error('Backup failed - aborting pull');
      process.exit(1);
    }
  } else {
    console.log('No existing .env.local - skipping backup');
  }
  return false;
}

function pull(): void {
  console.log('\nPulling environment variables from Vercel...');

  // Use spawnSync for better control
  const result = spawnSync('vercel', ['env', 'pull', '.env.local'], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error('\nVercel env pull failed');
    console.log('Ensure you are logged in: vercel login');
    console.log('Ensure project is linked: vercel link');
    process.exit(1);
  }
}

function validate(): void {
  console.log('\nValidating pulled environment...');

  try {
    execSync('pnpm env:validate', { stdio: 'inherit' });
  } catch {
    console.error('\nValidation found issues - review above warnings');
    process.exit(1);
  }
}

function showSummary(): void {
  const envPath = join(process.cwd(), ENV_FILE);

  if (!existsSync(envPath)) {
    console.error('\nError: .env.local was not created');
    process.exit(1);
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const vars = lines.filter((line) => line.trim() && !line.startsWith('#') && line.includes('='));

  console.log('\n--- Summary ---');
  console.log(`Total variables: ${vars.length}`);
  console.log('Environment ready for development');
}

// Main flow
backup();
pull();
validate();
showSummary();
