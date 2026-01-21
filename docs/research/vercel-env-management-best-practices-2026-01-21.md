# Vercel Environment Variables Management Best Practices

**Date:** 2026-01-21
**Status:** Research Complete
**Relevance:** izzie2 Next.js project with Vercel deployment

## Executive Summary

This research addresses three critical problems with Vercel environment variable management:
1. `vercel env pull` can overwrite local `.env.local` without warning
2. Copy/pasting env vars introduces newlines and corrupted values
3. No built-in backup/restore mechanism for env vars

**Recommended Solution:** Implement a hybrid approach using:
- **pnpm scripts** for daily operations (cross-platform, team-friendly)
- **T3 Env + Zod** for runtime validation (catches format errors)
- **Custom backup mechanism** before any sync operations

## Problems Analyzed

### Problem 1: `vercel env pull` Overwrites Local Files

The `vercel env pull` command directly writes to `.env.local` without creating backups. If you have local-only development overrides, they get lost.

**Default behavior:**
```bash
vercel env pull .env.local  # Overwrites without warning
```

### Problem 2: Newlines and Corrupted Values

When copy/pasting multi-line values (like private keys or JSON) from dashboards:
- Browsers may add extra whitespace
- Line endings differ between OS (CRLF vs LF)
- Special characters get mangled
- JSON values lose proper escaping

**Known Next.js issue:** Special characters in `.env.local` may not load correctly ([GitHub Issue #14985](https://github.com/vercel/next.js/issues/14985)).

### Problem 3: No Backup/Restore Mechanism

Neither Vercel CLI nor dashboard provides:
- Version history for env vars
- Rollback capability
- Export/import for disaster recovery

## Recommended Solutions

### Solution 1: Environment Validation with T3 Env + Zod

**Installation:**
```bash
pnpm add @t3-oss/env-nextjs zod
```

**Create `src/env.ts`:**
```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.string().url().startsWith("postgresql://"),

    // Neo4j
    NEO4J_URI: z.string().startsWith("neo4j"),
    NEO4J_USER: z.string().min(1),
    NEO4J_PASSWORD: z.string().min(1),

    // APIs - validate no newlines, proper format
    OPENROUTER_API_KEY: z.string()
      .regex(/^sk-or-v1-[a-zA-Z0-9]+$/, "Invalid OpenRouter key format")
      .refine(val => !val.includes('\n'), "Key contains newlines"),

    // Auth secrets - validate proper length
    BETTER_AUTH_SECRET: z.string().min(32, "Secret must be at least 32 characters"),

    // Inngest
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().endsWith(".apps.googleusercontent.com"),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // Telegram (optional)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

    // E2E Testing
    E2E_TEST_EMAIL: z.string().email().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  },

  // Required for Next.js bundling
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USER: process.env.NEO4J_USER,
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    E2E_TEST_EMAIL: process.env.E2E_TEST_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  },

  // Fail fast on missing vars
  skipValidation: false,

  // Empty strings are treated as undefined
  emptyStringAsUndefined: true,
});
```

**Add to `next.config.ts`:**
```typescript
import "./src/env.ts";  // Validates at build time
```

**Benefits:**
- Catches newlines, format errors at build time
- TypeScript autocompletion for env vars
- Clear error messages when values are corrupted
- Separates server/client variables safely

### Solution 2: pnpm Scripts for Env Management

**Why pnpm scripts over Makefile:**
- Cross-platform (Windows support)
- No additional tooling required
- Team-friendly (everyone has pnpm)
- Integrates with existing `package.json`

**Add to `package.json`:**
```json
{
  "scripts": {
    "env:backup": "tsx scripts/env-backup.ts",
    "env:pull": "tsx scripts/env-pull.ts",
    "env:validate": "tsx scripts/env-validate.ts",
    "env:diff": "tsx scripts/env-diff.ts",
    "env:restore": "tsx scripts/env-restore.ts"
  }
}
```

### Solution 3: Env Management Scripts

**Create `scripts/env-backup.ts`:**
```typescript
#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILES = ['.env.local', '.env.development.local', '.env.production.local'];
const BACKUP_DIR = '.env-backups';

function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, timestamp);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  fs.mkdirSync(backupPath, { recursive: true });

  let backedUp = 0;
  for (const file of ENV_FILES) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(backupPath, file));
      console.log(`Backed up: ${file} -> ${backupPath}/${file}`);
      backedUp++;
    }
  }

  if (backedUp === 0) {
    console.log('No env files found to backup');
  } else {
    console.log(`\nBackup complete: ${backupPath}`);
  }

  // Keep only last 10 backups
  cleanupOldBackups();
}

function cleanupOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();

  if (backups.length > 10) {
    for (const old of backups.slice(10)) {
      fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true });
      console.log(`Cleaned up old backup: ${old}`);
    }
  }
}

backup();
```

**Create `scripts/env-pull.ts`:**
```typescript
#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';

const ENV_TARGET = process.argv[2] || 'development';

console.log(`\n1. Creating backup before pull...`);
execSync('pnpm env:backup', { stdio: 'inherit' });

console.log(`\n2. Pulling ${ENV_TARGET} env from Vercel...`);
try {
  execSync(`vercel env pull .env.local --environment=${ENV_TARGET}`, {
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Failed to pull from Vercel. Is vercel CLI installed and linked?');
  process.exit(1);
}

console.log(`\n3. Validating pulled env vars...`);
execSync('pnpm env:validate', { stdio: 'inherit' });

console.log('\nEnv pull complete!');
```

**Create `scripts/env-validate.ts`:**
```typescript
#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';

interface ValidationError {
  key: string;
  issue: string;
  value?: string;
}

function parseEnvFile(filePath: string): Map<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const vars = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);

    // Remove surrounding quotes if present
    const unquoted = value.replace(/^["']|["']$/g, '');
    vars.set(key, unquoted);
  }

  return vars;
}

function validateEnvVars(vars: Map<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of vars) {
    // Check for embedded newlines (common copy/paste issue)
    if (value.includes('\n') || value.includes('\r')) {
      errors.push({
        key,
        issue: 'Contains embedded newlines (likely copy/paste error)',
        value: value.slice(0, 50) + (value.length > 50 ? '...' : '')
      });
    }

    // Check for trailing whitespace
    if (value !== value.trim()) {
      errors.push({
        key,
        issue: 'Contains leading/trailing whitespace',
      });
    }

    // Check for empty values that should have content
    if (value === '' && !key.includes('OPTIONAL')) {
      errors.push({
        key,
        issue: 'Empty value',
      });
    }

    // Validate URL formats
    if (key.includes('_URL') || key.includes('_URI')) {
      try {
        new URL(value);
      } catch {
        errors.push({
          key,
          issue: 'Invalid URL format',
          value: value.slice(0, 50)
        });
      }
    }

    // Validate API key formats
    if (key === 'OPENROUTER_API_KEY' && !value.startsWith('sk-or-')) {
      errors.push({
        key,
        issue: 'Should start with "sk-or-"',
      });
    }
  }

  return errors;
}

function validate() {
  const envFile = process.argv[2] || '.env.local';

  if (!fs.existsSync(envFile)) {
    console.error(`File not found: ${envFile}`);
    process.exit(1);
  }

  console.log(`Validating: ${envFile}\n`);

  const vars = parseEnvFile(envFile);
  const errors = validateEnvVars(vars);

  console.log(`Found ${vars.size} environment variables`);

  if (errors.length === 0) {
    console.log('\n All validations passed!');
  } else {
    console.log(`\n Found ${errors.length} issues:\n`);
    for (const error of errors) {
      console.log(`  ${error.key}`);
      console.log(`    Issue: ${error.issue}`);
      if (error.value) {
        console.log(`    Value: "${error.value}"`);
      }
      console.log();
    }
    process.exit(1);
  }
}

validate();
```

**Create `scripts/env-diff.ts`:**
```typescript
#!/usr/bin/env tsx
import * as fs from 'fs';

function parseEnvFile(filePath: string): Map<string, string> {
  if (!fs.existsSync(filePath)) return new Map();

  const content = fs.readFileSync(filePath, 'utf-8');
  const vars = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, '');
    vars.set(key, value);
  }

  return vars;
}

function diff(file1: string, file2: string) {
  console.log(`\nComparing ${file1} with ${file2}\n`);

  const vars1 = parseEnvFile(file1);
  const vars2 = parseEnvFile(file2);

  const allKeys = new Set([...vars1.keys(), ...vars2.keys()]);

  let added = 0, removed = 0, changed = 0;

  for (const key of [...allKeys].sort()) {
    const val1 = vars1.get(key);
    const val2 = vars2.get(key);

    if (val1 === undefined) {
      console.log(`+ ${key} (added in ${file2})`);
      added++;
    } else if (val2 === undefined) {
      console.log(`- ${key} (only in ${file1})`);
      removed++;
    } else if (val1 !== val2) {
      console.log(`~ ${key} (changed)`);
      changed++;
    }
  }

  console.log(`\nSummary: +${added} -${removed} ~${changed}`);
}

const file1 = process.argv[2] || '.env.local';
const file2 = process.argv[3] || '.env.example';

diff(file1, file2);
```

**Create `scripts/env-restore.ts`:**
```typescript
#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';

const BACKUP_DIR = '.env-backups';

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backups found');
    return [];
  }

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();
}

function restore(backupName?: string) {
  const backups = listBackups();

  if (backups.length === 0) {
    console.log('No backups available');
    process.exit(1);
  }

  if (!backupName) {
    console.log('Available backups:');
    backups.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    console.log('\nUsage: pnpm env:restore <backup-name>');
    console.log('Or: pnpm env:restore latest');
    return;
  }

  const target = backupName === 'latest' ? backups[0] : backupName;
  const backupPath = path.join(BACKUP_DIR, target);

  if (!fs.existsSync(backupPath)) {
    console.error(`Backup not found: ${target}`);
    process.exit(1);
  }

  const files = fs.readdirSync(backupPath);
  for (const file of files) {
    fs.copyFileSync(path.join(backupPath, file), file);
    console.log(`Restored: ${file}`);
  }

  console.log(`\nRestored from: ${target}`);
}

restore(process.argv[2]);
```

### Solution 4: Update .gitignore

**Add to `.gitignore`:**
```gitignore
# Env backups (contain secrets)
.env-backups/

# Vercel local cache
.vercel/.env.*
```

## Alternative Tools Evaluated

### dotenv-vault (Not Recommended for This Project)

**Pros:**
- Encrypted storage
- Version history
- Team sync

**Cons:**
- Another third-party dependency
- Adds complexity when Vercel already manages secrets
- Monthly cost for teams

**Verdict:** Overkill when using Vercel's native env management.

### Makefile Approach

**Pros:**
- Powerful, proven pattern
- Good for multi-step workflows
- Self-documenting

**Cons:**
- Not available on Windows without WSL
- Extra tooling for frontend developers
- Syntax unfamiliar to JS/TS developers

**Verdict:** Use pnpm scripts for better cross-platform support.

## Implementation Plan

### Phase 1: Validation (Immediate)
1. Install T3 Env + Zod
2. Create `src/env.ts` with validation schema
3. Add import to `next.config.ts`
4. Test build catches format errors

### Phase 2: Backup Scripts (Same Day)
1. Create `scripts/env-*.ts` files
2. Add scripts to `package.json`
3. Update `.gitignore` for backups
4. Document in README

### Phase 3: Team Workflow (Week 1)
1. Train team on `pnpm env:pull` instead of raw `vercel env pull`
2. Add CI check that validates env format
3. Document workflow in CONTRIBUTING.md

## Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm env:backup` | Create timestamped backup |
| `pnpm env:pull` | Backup + pull + validate |
| `pnpm env:pull production` | Pull from production |
| `pnpm env:validate` | Check for format issues |
| `pnpm env:diff .env.local .env.example` | Compare files |
| `pnpm env:restore` | List available backups |
| `pnpm env:restore latest` | Restore most recent backup |

## Sources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/environment-variables)
- [Vercel CLI env command](https://vercel.com/docs/cli/env)
- [T3 Env Documentation](https://env.t3.gg/docs/nextjs)
- [Next.js Environment Variables Guide](https://nextjs.org/docs/pages/guides/environment-variables)
- [Managing Next.js Environment Variables (Wisp CMS)](https://www.wisp.blog/blog/managing-nextjs-environment-variables-from-development-to-production-vercel)
- [Makefiles for Frontend (FINN.no)](https://medium.com/finn-no/makefiles-for-frontend-1779be46461b)
- [Why I Prefer Makefiles (Atomic Object)](https://spin.atomicobject.com/makefiles-vs-package-json-scripts/)
- [dotenv-vault GitHub](https://github.com/dotenv-org/dotenv-vault)
- [Next.js Special Characters Issue #14985](https://github.com/vercel/next.js/issues/14985)
- [Create T3 App Environment Variables](https://create.t3.gg/en/usage/env-variables)

## Conclusion

The recommended approach combines:
1. **T3 Env + Zod** for compile-time validation (catches corrupted values)
2. **pnpm scripts** for safe operations (backup before pull, cross-platform)
3. **Local backup mechanism** for disaster recovery

This provides safety without adding external services or complex tooling, and integrates seamlessly with the existing Next.js + Vercel workflow.
