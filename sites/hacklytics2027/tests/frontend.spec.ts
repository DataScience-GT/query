import { test, expect } from '@playwright/test';

test.describe('Frontend Rendering and Navigation', () => {
  test('Homepage loads and Digital Bloom assets are present', async ({ page }) => {
    // Navigate to the local dev server
    await page.goto('/');

    // Verify the page title
    await expect(page).toHaveTitle(/Hacklytics 2027/);

    // Verify the hero section header (Digital Bloom theme)
    const heroHeader = page.getByRole('heading', { name: /HACKLYTICS 2027/i }).first();
    await expect(heroHeader).toBeVisible();

    // Verify that the navbar has the right structure
    const scheduleLink = page.getByRole('link', { name: /Schedule/i }).first();
    await expect(scheduleLink).toBeVisible();

    // Verify scrolling / navigation to About section
    const aboutLink = page.getByRole('link', { name: /About/i }).first();
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();
    
    // Check that the URL updated to the anchor
    await expect(page).toHaveURL(/#about/);
    
    // Verify the about section header
    const aboutHeader = page.getByRole('heading', { name: /About The Event/i }).first();
    await expect(aboutHeader).toBeVisible();
  });
});
