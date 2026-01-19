import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.message);
  });

  try {
    // Navigate to dashboard
    await page.goto('http://localhost:3300/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a bit for any async rendering
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: '/tmp/dashboard-screenshot.png',
      fullPage: true
    });

    // Check for navbar
    const navbarExists = await page.locator('nav').count() > 0;
    const navbarVisible = navbarExists ? await page.locator('nav').isVisible() : false;

    // Get page title
    const title = await page.title();

    // Get main content
    const bodyText = await page.locator('body').textContent();

    console.log(JSON.stringify({
      success: true,
      title,
      navbarExists,
      navbarVisible,
      consoleErrors: consoleMessages.filter(m => m.type === 'error'),
      consoleWarnings: consoleMessages.filter(m => m.type === 'warning'),
      pageErrors: errors,
      bodyPreview: bodyText?.substring(0, 500)
    }, null, 2));

  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  } finally {
    await browser.close();
  }
})();
