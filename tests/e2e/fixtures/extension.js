import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend({
  // Build directory to load; projects override via `use: { extensionDir }`
  // (the canary loads its bridge-enabled build from .canary/dist).
  extensionDir: ['dist', { option: true }],

  context: async ({ extensionDir }, use) => {
    const extensionPath = path.resolve(extensionDir);

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });

    await use(context);
    await context.close();
  },

  extensionPage: async ({ context }, use) => {
    // Wait for extension to load
    await new Promise((r) => setTimeout(r, 1000));

    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
