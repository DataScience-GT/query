const { chromium } = require('playwright');
const path = require('path');

// A generic script for the LLM to easily capture screenshots of any site.
// Usage: npx ts-node scripts/capture-vision.ts [URL] [OUTPUT_PATH]

async function captureVision() {
  const url = process.argv[2] || 'http://localhost:3000';
  // Default to the conversation artifact directory if none is provided
  const outputPath = process.argv[3] || path.join('C:\\Users\\bootcamp\\.gemini\\antigravity-cli\\brain\\7123c33e-cf4a-42c2-ac7c-c87c2e8eb05c', 'vision-snapshot.png');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Slight delay to allow animations to settle
    await page.waitForTimeout(2000);

    await page.screenshot({ path: outputPath, fullPage: true });
  } catch (error) {
    console.error(`❌ Failed to capture screenshot:`, error);
  } finally {
    await browser.close();
  }
}

captureVision();
