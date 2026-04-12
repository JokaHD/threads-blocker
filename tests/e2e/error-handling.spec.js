import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
  });

  test('handles rate limit gracefully', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'blockRateLimit');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('#tb-shadow-host', { timeout: 10000, state: 'attached' });

    // Extension should load even with rate limit response queued
    const shadowHost = await page.$('#tb-shadow-host');
    expect(shadowHost).toBeTruthy();
  });

  test('handles network errors gracefully', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'networkError');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('#tb-shadow-host', { timeout: 10000, state: 'attached' });

    // Extension should still load
    const shadowHost = await page.$('#tb-shadow-host');
    expect(shadowHost).toBeTruthy();
  });
});
