import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
<<<<<<< HEAD
    command: 'pnpm run dev',
=======
    command: 'npm run dev',
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
