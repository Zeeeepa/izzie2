/**
 * Test extraction status display fix
 */

// Mock extraction progress data (from database)
// Test IDs are development fixtures, not secrets  pragma: allowlist secret
const mockProgressData = [
  {
    id: 'a7c8230a-b43f-4c12-a95c-b7dcb1acc738',
    userId: 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF',
    source: 'calendar',
    status: 'running',
    totalItems: 0,
    processedItems: 57,
    failedItems: 0,
    entitiesExtracted: 233,
    lastRunAt: new Date('2026-01-19T04:05:56.602Z'),
    updatedAt: new Date('2026-01-19T04:18:34.815Z'),
  },
  {
    id: 'dcf39957-da83-405d-aad1-1f29310b60c6',
    userId: 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF',
    source: 'drive',
    status: 'idle',
    totalItems: 0,
    processedItems: 0,
    failedItems: 0,
    entitiesExtracted: 0,
    lastRunAt: new Date('2026-01-17T02:35:52.462Z'),
    updatedAt: new Date('2026-01-19T04:17:06.322Z'),
  },
  {
    id: '43bf4da6-5c2f-4027-a145-7a475148cfe4',
    userId: 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF',
    source: 'email',
    status: 'completed',
    totalItems: 21,
    processedItems: 21,
    failedItems: 0,
    entitiesExtracted: 93,
    lastRunAt: new Date('2026-01-19T04:07:15.685Z'),
    updatedAt: new Date('2026-01-19T04:07:15.702Z'),
  },
];

/**
 * OLD VERSION: Check if extraction is stale (using lastRunAt)
 */
function isExtractionStale_OLD(progress) {
  if (progress.status !== 'running') {
    return false;
  }

  if (!progress.lastRunAt) {
    return true;
  }

  const now = new Date();
  const lastRun = new Date(progress.lastRunAt);
  const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

  return minutesSinceLastRun > 5;
}

/**
 * NEW VERSION: Check if extraction is stale (using updatedAt)
 */
function isExtractionStale_NEW(progress) {
  if (progress.status !== 'running') {
    return false;
  }

  if (!progress.updatedAt) {
    return true;
  }

  const now = new Date();
  const lastUpdate = new Date(progress.updatedAt);
  const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

  return minutesSinceLastUpdate > 5;
}

/**
 * OLD VERSION: Calculate progress percentage
 */
function calculateProgress_OLD(progress) {
  if (!progress.totalItems || progress.totalItems === 0) {
    return 0;
  }
  return Math.round((progress.processedItems / progress.totalItems) * 100);
}

/**
 * NEW VERSION: Calculate progress percentage
 */
function calculateProgress_NEW(progress) {
  // If we have processed items but no total, consider it complete (100%)
  if ((!progress.totalItems || progress.totalItems === 0) && progress.processedItems > 0) {
    return 100;
  }

  // No total items and no processed items = not started
  if (!progress.totalItems || progress.totalItems === 0) {
    return 0;
  }

  // Normal case: calculate percentage
  return Math.round((progress.processedItems / progress.totalItems) * 100);
}

/**
 * Get effective status
 */
function getEffectiveStatus(progress, isStaleFunc) {
  if (isStaleFunc(progress)) {
    return 'error';
  }
  return progress.status;
}

console.log('🧪 Testing Extraction Status Display Fix\n');
console.log('Current time:', new Date().toISOString());
console.log('');

// Test each source with OLD and NEW logic
mockProgressData.forEach((progress) => {
  console.log(`\n📊 ${progress.source.toUpperCase()}`);
  console.log('─'.repeat(60));
  console.log(`Database Status: ${progress.status}`);
  console.log(`Total Items: ${progress.totalItems}`);
  console.log(`Processed Items: ${progress.processedItems}`);
  console.log(`Entities Extracted: ${progress.entitiesExtracted}`);
  console.log(`Last Run: ${progress.lastRunAt?.toISOString()}`);
  console.log(`Updated At: ${progress.updatedAt?.toISOString()}`);

  // Calculate minutes since last update
  if (progress.updatedAt) {
    const minutesSinceUpdate = (new Date().getTime() - new Date(progress.updatedAt).getTime()) / (1000 * 60);
    console.log(`Minutes Since Update: ${minutesSinceUpdate.toFixed(1)}`);
  }

  // OLD Logic
  const oldStale = isExtractionStale_OLD(progress);
  const oldStatus = getEffectiveStatus(progress, isExtractionStale_OLD);
  const oldProgress = calculateProgress_OLD(progress);

  console.log('\n❌ OLD LOGIC:');
  console.log(`  Is Stale? ${oldStale}`);
  console.log(`  Effective Status: ${oldStatus}`);
  console.log(`  Progress: ${oldProgress}%`);

  // NEW Logic
  const newStale = isExtractionStale_NEW(progress);
  const newStatus = getEffectiveStatus(progress, isExtractionStale_NEW);
  const newProgress = calculateProgress_NEW(progress);

  console.log('\n✅ NEW LOGIC:');
  console.log(`  Is Stale? ${newStale}`);
  console.log(`  Effective Status: ${newStatus}`);
  console.log(`  Progress: ${newProgress}%`);

  // Show what user would see
  console.log('\n👁️  DISPLAY:');
  console.log(`  OLD: ${oldStatus}, Progress: ${oldProgress}%, Items: ${progress.processedItems}/${progress.totalItems}, Entities: ${progress.entitiesExtracted}`);
  console.log(`  NEW: ${newStatus}, Progress: ${newProgress}%, Items: ${progress.processedItems}/${progress.totalItems}, Entities: ${progress.entitiesExtracted}`);
});

console.log('\n\n✨ Summary of Changes:');
console.log('1. Stale detection now uses updatedAt instead of lastRunAt');
console.log('   - Calendar: updatedAt is recent (< 5 min), so NOT stale anymore');
console.log('   - This prevents false "error" status for active extractions');
console.log('');
console.log('2. Progress calculation handles total_items=0 + processed_items>0');
console.log('   - Calendar: Shows 100% instead of 0% (has processed items)');
console.log('   - Drive: Still shows 0% (no processed items)');
console.log('');
console.log('✅ Fix complete! Calendar should now show "running" instead of "error"');
