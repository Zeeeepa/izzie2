#!/usr/bin/env tsx
/**
 * Headless Training Pipeline CLI
 *
 * Process emails and generate training data from feedback for ML model improvement.
 *
 * Usage:
 *   pnpm onboarding:train --days 30
 *   pnpm onboarding:train --mode feedback --export ./data/training.jsonl
 *   pnpm onboarding:train --dry-run
 *
 * Options:
 *   --days N        Process emails from the last N days (default: 30)
 *   --mode MODE     Processing mode: 'feedback' or 'process' (default: feedback)
 *                   - feedback: Generate training data from existing feedback
 *                   - process: Process emails headlessly (requires OAuth tokens)
 *   --export FILE   Export path for training data (default: ./data/training/output)
 *   --format FMT    Export format: jsonl, openai, anthropic, all (default: jsonl)
 *   --dry-run       Show what would be done without making changes
 *   --help          Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';
import { getFeedbackService } from '../services/feedback';
import { getFewShotGenerator } from '../services/few-shot-generator';
import { getTrainingExporter, type ExportFormat } from '../services/training-export';

const LOG_PREFIX = '[Train]';

interface CliArgs {
  days: number;
  mode: 'feedback' | 'process';
  export: string;
  format: ExportFormat | 'all';
  dryRun: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliArgs {
  const args: CliArgs = {
    days: 30,
    mode: 'feedback',
    export: path.join(process.cwd(), 'data', 'training', 'output'),
    format: 'jsonl',
    dryRun: false,
    help: false,
  };

  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--days':
        const daysValue = parseInt(argv[++i], 10);
        if (isNaN(daysValue) || daysValue <= 0) {
          console.error('Error: --days must be a positive number');
          process.exit(1);
        }
        args.days = daysValue;
        break;

      case '--mode':
        const modeValue = argv[++i];
        if (modeValue !== 'feedback' && modeValue !== 'process') {
          console.error('Error: --mode must be "feedback" or "process"');
          process.exit(1);
        }
        args.mode = modeValue;
        break;

      case '--export':
        args.export = argv[++i];
        if (!args.export) {
          console.error('Error: --export requires a file path');
          process.exit(1);
        }
        break;

      case '--format':
        const formatValue = argv[++i]?.toLowerCase();
        if (!['jsonl', 'openai', 'anthropic', 'all'].includes(formatValue)) {
          console.error('Error: --format must be "jsonl", "openai", "anthropic", or "all"');
          process.exit(1);
        }
        args.format = formatValue as ExportFormat | 'all';
        break;

      case '--dry-run':
        args.dryRun = true;
        break;

      case '--help':
      case '-h':
        args.help = true;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Headless Training Pipeline CLI

Process emails and generate training data from feedback for ML model improvement.

Usage:
  pnpm onboarding:train [options]

Options:
  --days N        Process emails from the last N days (default: 30)
  --mode MODE     Processing mode: 'feedback' or 'process' (default: feedback)
                  - feedback: Generate training data from existing feedback
                  - process: Process emails headlessly (requires OAuth tokens)
  --export FILE   Export path for training data (default: ./data/training/output)
  --format FMT    Export format: jsonl, openai, anthropic, all (default: jsonl)
  --dry-run       Show what would be done without making changes
  --help, -h      Show this help message

Examples:
  # Generate training data from feedback (last 30 days)
  pnpm onboarding:train

  # Generate training data from last 60 days
  pnpm onboarding:train --days 60

  # Export in all formats
  pnpm onboarding:train --format all --export ./data/my-training

  # Preview what would be exported
  pnpm onboarding:train --dry-run
`);
}

/**
 * Run feedback mode: Generate training data from existing feedback
 */
async function runFeedbackMode(args: CliArgs): Promise<void> {
  console.log(`${LOG_PREFIX} Running in feedback mode`);
  console.log(`${LOG_PREFIX} Days: ${args.days}`);
  console.log(`${LOG_PREFIX} Export path: ${args.export}`);
  console.log(`${LOG_PREFIX} Format: ${args.format}`);

  // Initialize services
  const feedbackService = getFeedbackService();
  const fewShotGenerator = getFewShotGenerator(feedbackService);
  const trainingExporter = getTrainingExporter(feedbackService);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - args.days);

  console.log(`${LOG_PREFIX} Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  // Try to load existing feedback data
  const feedbackDir = path.join(process.cwd(), 'data', 'feedback');
  if (fs.existsSync(feedbackDir)) {
    const feedbackFiles = fs.readdirSync(feedbackDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of feedbackFiles) {
      const filePath = path.join(feedbackDir, file);
      try {
        await feedbackService.loadFromFile(filePath);
        console.log(`${LOG_PREFIX} Loaded feedback from: ${file}`);
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to load ${file}:`, error);
      }
    }
  }

  // Get statistics
  const feedbackStats = feedbackService.getStats();
  const fewShotStats = fewShotGenerator.getStats();
  const exportStats = trainingExporter.getStats();

  console.log('\n--- Feedback Statistics ---');
  console.log(`Total feedback records: ${feedbackStats.total}`);
  console.log(`Positive: ${feedbackStats.positive}`);
  console.log(`Negative: ${feedbackStats.negative}`);
  console.log(`  By type:`);
  console.log(`    Entity - Positive: ${feedbackStats.byType.entity.positive}, Negative: ${feedbackStats.byType.entity.negative}`);
  console.log(`    Relationship - Positive: ${feedbackStats.byType.relationship.positive}, Negative: ${feedbackStats.byType.relationship.negative}`);

  console.log('\n--- Few-Shot Statistics ---');
  console.log(`Negative feedback: ${fewShotStats.negativeFeedback}`);
  console.log(`With corrections: ${fewShotStats.withCorrections}`);
  console.log(`  Entity corrections: ${fewShotStats.byType.entity}`);
  console.log(`  Relationship corrections: ${fewShotStats.byType.relationship}`);

  if (args.dryRun) {
    console.log('\n--- Dry Run ---');
    console.log('Would export:');
    console.log(`  Records: ${exportStats.negativeFeedback} (negative feedback)`);
    console.log(`  With corrections: ${exportStats.withCorrections}`);
    console.log(`  Output: ${args.export}`);
    console.log(`  Format(s): ${args.format === 'all' ? 'jsonl, openai, anthropic' : args.format}`);
    console.log('\nRun without --dry-run to generate files.');
    return;
  }

  // Generate few-shot examples
  console.log('\n--- Generating Few-Shot Examples ---');
  const examples = fewShotGenerator.generateExamples({
    maxExamples: 100,
    requireCorrection: true,
    startDate,
    endDate,
  });
  console.log(`Generated ${examples.length} few-shot examples`);

  if (examples.length > 0) {
    // Format as prompt section for preview
    const promptSection = fewShotGenerator.formatAsPromptSection(examples.slice(0, 3));
    console.log('\n--- Sample Prompt Section (first 3 examples) ---');
    console.log(promptSection);
  }

  // Export training data
  console.log('\n--- Exporting Training Data ---');
  const formats: ExportFormat[] = args.format === 'all'
    ? ['jsonl', 'openai', 'anthropic']
    : [args.format];

  const results = await trainingExporter.export({
    outputPath: args.export,
    formats,
    includePositive: false,
    startDate,
    endDate,
  });

  console.log('\nExport Results:');
  for (const result of results) {
    if (result.success) {
      console.log(`  [OK] ${result.format}: ${result.filePath} (${result.recordCount} records)`);
    } else {
      console.log(`  [FAIL] ${result.format}: ${result.error}`);
    }
  }

  // Also export few-shot examples separately
  if (examples.length > 0) {
    const fewShotPath = args.export.replace(/\/?$/, '') + '_fewshot';
    console.log(`\nExporting few-shot examples to: ${fewShotPath}`);

    for (const format of formats) {
      const result = trainingExporter.exportFewShotExamples(examples, fewShotPath, format);
      if (result.success) {
        console.log(`  [OK] ${format}: ${result.filePath} (${result.recordCount} examples)`);
      } else {
        console.log(`  [FAIL] ${format}: ${result.error}`);
      }
    }
  }

  console.log('\n--- Complete ---');
}

/**
 * Run process mode: Process emails headlessly
 * Note: This requires OAuth tokens to be available
 */
async function runProcessMode(args: CliArgs): Promise<void> {
  console.log(`${LOG_PREFIX} Running in process mode`);
  console.log(`${LOG_PREFIX} Days: ${args.days}`);

  if (args.dryRun) {
    console.log('\n--- Dry Run ---');
    console.log('Would process emails from the last', args.days, 'days');
    console.log('Note: Process mode requires OAuth tokens from a previous login.');
    console.log('Run the onboarding UI first to authenticate, then use process mode.');
    console.log('\nRun without --dry-run to process emails.');
    return;
  }

  // Check for OAuth tokens
  const tokenPath = path.join(process.cwd(), 'data', 'onboarding', 'tokens.json');
  if (!fs.existsSync(tokenPath)) {
    console.error('\nError: No OAuth tokens found.');
    console.error('Please run the onboarding UI first to authenticate:');
    console.error('  pnpm onboarding');
    console.error('\nThen try again with:');
    console.error('  pnpm onboarding:train --mode process');
    process.exit(1);
  }

  // For now, just show a message about the process mode
  // Full implementation would require setting up OAuth client and email processor
  console.log('\n--- Process Mode ---');
  console.log('Process mode is designed for automated email processing.');
  console.log('It would:');
  console.log(`  1. Load OAuth tokens from ${tokenPath}`);
  console.log(`  2. Fetch sent emails from the last ${args.days} days`);
  console.log('  3. Extract entities and relationships');
  console.log('  4. Store results for training');
  console.log('\nNote: Full headless processing requires additional setup.');
  console.log('For now, use the onboarding UI or feedback mode.');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('Onboarding Training Pipeline');
  console.log('='.repeat(60));

  try {
    switch (args.mode) {
      case 'feedback':
        await runFeedbackMode(args);
        break;
      case 'process':
        await runProcessMode(args);
        break;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
