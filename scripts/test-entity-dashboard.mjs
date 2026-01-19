import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testEntityDashboard() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000 // Slow down actions for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Create screenshots directory
  const screenshotsDir = join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    console.log('📍 Step 1: Navigate to login page...');
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(screenshotsDir, '01-landing-page.png'), fullPage: true });
    console.log('✅ Screenshot saved: 01-landing-page.png');

    // Check if already logged in by looking for dashboard elements
    const isDashboard = await page.url().includes('/dashboard');

    if (!isDashboard) {
      console.log('📍 Step 2: Looking for Google Sign-in button...');

      // Try to find and click the Google sign-in button
      const signInButton = await page.locator('button:has-text("Sign in with Google"), a:has-text("Sign in with Google"), button:has-text("Continue with Google")').first();

      if (await signInButton.count() > 0) {
        await signInButton.click();
        console.log('✅ Clicked sign-in button');

        // Wait for OAuth redirect or dashboard
        await page.waitForTimeout(3000);
        await page.screenshot({ path: join(screenshotsDir, '02-after-signin-click.png'), fullPage: true });
        console.log('✅ Screenshot saved: 02-after-signin-click.png');
      } else {
        console.log('⚠️  Sign-in button not found, might already be logged in');
      }
    } else {
      console.log('✅ Already on dashboard, skipping login');
    }

    console.log('📍 Step 3: Navigate to entities dashboard...');
    await page.goto('http://localhost:3300/dashboard/entities', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Wait for data to load

    await page.screenshot({ path: join(screenshotsDir, '03-entities-dashboard.png'), fullPage: true });
    console.log('✅ Screenshot saved: 03-entities-dashboard.png');

    // Check for console errors
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Check for entities
    console.log('📍 Step 4: Verifying entities are displayed...');
    const entityCards = await page.locator('[data-testid="entity-card"], .entity-card, article, [role="article"]').count();
    console.log(`✅ Found ${entityCards} entity elements on page`);

    // Try to find type filter
    console.log('📍 Step 5: Testing type filtering...');
    const typeFilter = await page.locator('select, button:has-text("Type"), [data-testid="type-filter"]').first();

    if (await typeFilter.count() > 0) {
      console.log('✅ Type filter found');

      // Try filtering by "Person"
      const isSelect = await typeFilter.evaluate(el => el.tagName === 'SELECT');
      if (isSelect) {
        await typeFilter.selectOption({ label: 'Person' }).catch(() =>
          typeFilter.selectOption({ value: 'person' }).catch(() =>
            console.log('⚠️  Could not select "Person" option')
          )
        );
      }

      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(screenshotsDir, '04-filtered-by-person.png'), fullPage: true });
      console.log('✅ Screenshot saved: 04-filtered-by-person.png');
    } else {
      console.log('⚠️  Type filter not found');
    }

    // Try to find search
    console.log('📍 Step 6: Testing search functionality...');
    const searchInput = await page.locator('input[type="text"], input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first();

    if (await searchInput.count() > 0) {
      console.log('✅ Search input found');
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(screenshotsDir, '05-search-test.png'), fullPage: true });
      console.log('✅ Screenshot saved: 05-search-test.png');

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
    } else {
      console.log('⚠️  Search input not found');
    }

    // Get page content for analysis
    console.log('📍 Step 7: Analyzing page content...');
    const pageText = await page.textContent('body');
    const hasEntities = pageText.includes('Person') || pageText.includes('Company') || pageText.includes('Organization');
    console.log(hasEntities ? '✅ Entity types detected in page content' : '⚠️  No entity types found in page content');

    // Check for error messages
    const errorMessages = await page.locator('text=/error|Error|ERROR|failed|Failed/i').count();
    if (errorMessages > 0) {
      console.log(`⚠️  Found ${errorMessages} error-related messages on page`);
      await page.screenshot({ path: join(screenshotsDir, '06-errors.png'), fullPage: true });
    }

    console.log('\n📊 Test Summary:');
    console.log('================');
    console.log(`- Entity elements found: ${entityCards}`);
    console.log(`- Type filter available: ${await typeFilter.count() > 0 ? 'Yes' : 'No'}`);
    console.log(`- Search available: ${await searchInput.count() > 0 ? 'Yes' : 'No'}`);
    console.log(`- Entity types in content: ${hasEntities ? 'Yes' : 'No'}`);
    console.log(`- Error messages: ${errorMessages}`);
    console.log(`\n📁 Screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: join(screenshotsDir, 'error-screenshot.png'), fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

testEntityDashboard().catch(console.error);
