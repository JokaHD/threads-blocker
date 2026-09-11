import { defineConfig } from '@playwright/test';

/**
 * Canary config — real-site drift detection (npm run canary).
 * Separate from playwright.config.js (functional e2e): different testDir,
 * different failure semantics, different reporter.
 *
 * Stage projects encode the three-way classification: a failing stage skips
 * its dependents, so the first failing stage IS the verdict (see reporter).
 */
export default defineConfig({
  testDir: 'tests/canary',
  timeout: 60000,
  retries: 1, // one retry absorbs transient real-site flake before we call it a failure
  workers: 1, // serial against the real site — no concurrent hammering
  globalSetup: './tests/canary/global-setup.js',
  reporter: [['list'], ['./tests/canary/reporter.js']],
  use: {
    browserName: 'chromium',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'infra',
      testMatch: /infra\.spec\.js/,
    },
    {
      name: 'credential',
      testMatch: /credential\.spec\.js/,
      dependencies: ['infra'],
    },
    {
      name: 'contract-public',
      testMatch: /contract\.(public|extension)\.spec\.js/,
      dependencies: ['infra'],
    },
    {
      name: 'contract-authed',
      testMatch: /contract\.authed\.spec\.js/,
      dependencies: ['credential'],
    },
  ],
});
