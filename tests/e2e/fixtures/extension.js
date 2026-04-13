import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend({
  context: async (_, use) => {
    const extensionPath = path.resolve('dist');

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
