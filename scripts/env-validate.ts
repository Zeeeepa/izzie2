/**
 * Validate .env.local for common issues
 * - Newlines in values (breaks env parsing)
 * - Empty values
 * - Format issues
 * - Duplicate keys
 *
 * Usage: pnpm env:validate
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ENV_FILE = '.env.local';

interface ValidationIssue {
  line: number;
  key: string;
  type: 'error' | 'warning';
  message: string;
}

function validate(): void {
  const envPath = join(process.cwd(), ENV_FILE);

  if (!existsSync(envPath)) {
    console.log(`No ${ENV_FILE} found - nothing to validate`);
    process.exit(0);
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const issues: ValidationIssue[] = [];
  const seenKeys = new Map<string, number>();

  let lineNum = 0;

  for (const line of lines) {
    lineNum++;

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Check for valid KEY=VALUE format
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      issues.push({
        line: lineNum,
        key: line.slice(0, 20),
        type: 'error',
        message: 'Missing = separator',
      });
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1);

    // Check for empty key
    if (!key) {
      issues.push({
        line: lineNum,
        key: '(empty)',
        type: 'error',
        message: 'Empty key name',
      });
      continue;
    }

    // Check for invalid key characters
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      issues.push({
        line: lineNum,
        key,
        type: 'warning',
        message: 'Key contains non-standard characters',
      });
    }

    // Check for duplicate keys
    if (seenKeys.has(key)) {
      issues.push({
        line: lineNum,
        key,
        type: 'error',
        message: `Duplicate key (first seen on line ${seenKeys.get(key)})`,
      });
    } else {
      seenKeys.set(key, lineNum);
    }

    // Check for empty value
    if (!value.trim()) {
      issues.push({
        line: lineNum,
        key,
        type: 'warning',
        message: 'Empty value',
      });
    }

    // Check for unquoted values with spaces (potential issue)
    if (value.includes(' ') && !value.startsWith('"') && !value.startsWith("'")) {
      issues.push({
        line: lineNum,
        key,
        type: 'warning',
        message: 'Unquoted value contains spaces',
      });
    }

    // Check for literal \n in value (common Vercel issue)
    if (value.includes('\\n') && !value.startsWith('"')) {
      issues.push({
        line: lineNum,
        key,
        type: 'warning',
        message: 'Contains \\n - may need to be quoted for proper newline handling',
      });
    }

    // Check for potential multi-line value indicators
    if (value.includes('-----BEGIN') || value.includes('-----END')) {
      issues.push({
        line: lineNum,
        key,
        type: 'warning',
        message: 'Appears to contain certificate/key data - ensure proper escaping',
      });
    }
  }

  // Report results
  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  if (issues.length === 0) {
    console.log(`${ENV_FILE} validation passed`);
    console.log(`Checked ${seenKeys.size} variables - no issues found`);
    process.exit(0);
  }

  console.log(`\n${ENV_FILE} validation results:\n`);

  if (errors.length > 0) {
    console.log('ERRORS:');
    for (const issue of errors) {
      console.log(`  Line ${issue.line}: ${issue.key} - ${issue.message}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const issue of warnings) {
      console.log(`  Line ${issue.line}: ${issue.key} - ${issue.message}`);
    }
    console.log();
  }

  console.log(`Summary: ${errors.length} errors, ${warnings.length} warnings`);

  // Exit with error code if there are errors
  if (errors.length > 0) {
    process.exit(1);
  }
}

validate();
