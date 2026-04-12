import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Extension Loading', () => {
  test('loads on threads.com and injects Shadow DOM', async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
    await setupApiMocks(page);

    await page.goto('https://www.threads.com/');

    // Wait for extension to inject Shadow DOM host
    const shadowHost = await page.waitForSelector('#tb-shadow-host', {
      timeout: 10000,
      state: 'attached',
    });

    expect(shadowHost).toBeTruthy();
  });

  test('shows FAB (toolbar) in Shadow DOM', async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
    await setupApiMocks(page);

    await page.goto('https://www.threads.com/');

    // Wait for Shadow DOM host
    await page.waitForSelector('#tb-shadow-host', { timeout: 10000, state: 'attached' });

    // Check for toolbar inside Shadow DOM
    const hasToolbar = await page.evaluate(() => {
      const host = document.querySelector('#tb-shadow-host');
      if (!host || !host.shadowRoot) return false;
      return !!host.shadowRoot.querySelector('.tb-toolbar');
    });

    expect(hasToolbar).toBe(true);
  });

  test('does not load on non-threads sites', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.example.com/');

    // Wait a bit for any potential injection
    await page.waitForTimeout(2000);

    const shadowHost = await page.$('#tb-shadow-host');
    expect(shadowHost).toBeNull();
  });
});
