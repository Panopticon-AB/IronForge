import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  globalSetup:
    process.env.IRONFORGE_E2E_SKIP_GLOBAL_SETUP === 'true'
      ? undefined
      : './tests/e2e/setup/e2e-seed.ts',
  testDir: './tests/e2e',
  timeout: 120000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 13'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'tv',

      use: {
        viewport: { width: 1920, height: 1080 },
        hasTouch: false,
        colorScheme: 'dark',
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'smoke',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer:
    process.env.CI &&
    process.env.BASE_URL &&
    !process.env.BASE_URL.includes('localhost') &&
    !process.env.BASE_URL.includes('127.0.0.1')
      ? undefined
      : {
          command: 'npm run dev -- -p 3001 -H 127.0.0.1',
          url: 'http://127.0.0.1:3001',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
});
