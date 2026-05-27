import { test, expect } from '@playwright/test';

test.describe('Frontend Rendering and Navigation', () => {
  test('Homepage loads and Digital Bloom assets are present', async ({ page }) => {
    // Navigate to the local dev server
    await page.goto('/');

    // Verify the page title
    await expect(page).toHaveTitle(/Hacklytics 2027/);

    // Verify the hero section header (Digital Bloom theme)
<<<<<<< HEAD
    const heroHeader = page.getByRole('heading', { name: /HACKLYTICS 2027/i }).first();
    await expect(heroHeader).toBeVisible();

    // Verify that the navbar has the right structure
    const scheduleLink = page.getByRole('link', { name: /Schedule/i }).first();
    await expect(scheduleLink).toBeVisible();

    // Verify scrolling / navigation to About section
    const aboutLink = page.getByRole('link', { name: /About/i }).first();
=======
    const heroHeader = page.getByRole('heading', { name: /HACKLYTICS 2027/i });
    await expect(heroHeader).toBeVisible();

    // Verify that the navbar has the right structure
    const applyButton = page.getByRole('link', { name: /Apply Now/i }).first();
    await expect(applyButton).toBeVisible();

    // Verify scrolling / navigation to About section
    const aboutLink = page.locator('nav').getByRole('link', { name: /About/i });
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();
    
    // Check that the URL updated to the anchor
    await expect(page).toHaveURL(/#about/);
    
    // Verify the about section header
<<<<<<< HEAD
    const aboutHeader = page.getByRole('heading', { name: /About The Event/i }).first();
=======
    const aboutHeader = page.getByRole('heading', { name: /Data Science @ GT/i }).first();
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
    await expect(aboutHeader).toBeVisible();
  });
});
