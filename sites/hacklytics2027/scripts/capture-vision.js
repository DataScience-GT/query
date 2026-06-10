const { chromium } = require('playwright');
const path = require('path');

async function captureVision() {
  const url = process.argv[2] || 'http://localhost:3000';
  const outputPath = process.argv[3] || path.join('C:\\Users\\bootcamp\\.gemini\\antigravity-cli\\brain\\f197a858-fd32-4231-8a8c-0894db30b2bf', 'vision-snapshot.png');

  console.log(`Launching browser to capture ${url} to ${outputPath}...`);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Slight delay to allow animations to settle
    await page.waitForTimeout(2000);

    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`Screenshot saved to ${outputPath}`);
  } catch (error) {
    console.error(`Failed to capture screenshot:`, error);
  } finally {
    await browser.close();
  }
}

captureVision();
