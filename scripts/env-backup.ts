/**
 * Backup .env.local with timestamp to .env-backups/
 * Usage: pnpm env:backup
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ENV_FILE = '.env.local';
const BACKUP_DIR = '.env-backups';

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function backup(): void {
  const envPath = join(process.cwd(), ENV_FILE);
  const backupDir = join(process.cwd(), BACKUP_DIR);

  // Check if .env.local exists
  if (!existsSync(envPath)) {
    console.log(`No ${ENV_FILE} found - nothing to backup`);
    process.exit(0);
  }

  // Create backup directory if it doesn't exist
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
    console.log(`Created ${BACKUP_DIR}/`);
  }

  // Create timestamped backup
  const timestamp = getTimestamp();
  const backupName = `.env.local.${timestamp}`;
  const backupPath = join(backupDir, backupName);

  copyFileSync(envPath, backupPath);

  // Count lines for feedback
  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#')).length;

  console.log(`Backed up ${ENV_FILE} (${lines} vars) to ${BACKUP_DIR}/${backupName}`);
}

backup();
