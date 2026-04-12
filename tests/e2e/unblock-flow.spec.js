import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Unblock Flow', () => {
  test.beforeEach(async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
  });

  test('extension loads with unblock API ready', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'unblockSuccess');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('#tb-shadow-host', { timeout: 10000, state: 'attached' });

    // Verify extension loaded
    const shadowHost = await page.$('#tb-shadow-host');
    expect(shadowHost).toBeTruthy();
  });
});
