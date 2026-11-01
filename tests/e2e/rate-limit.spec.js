import { test, expect } from './fixtures/extension.js';
import { mockResponses, injectFakeTokens } from './mocks/threads-api.js';

// Meta's real throttle shape (HTTP 200 + GraphQL error code 1675004) must put
// the queue into the 24h cooldown instead of burning items into FAILED.
// Runs fully offline: threads.com is served from a stub page.

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const STUB_PAGE = `<!doctype html><html><head>
<script>"DTSGInitialData",[],{"token":"test-dtsg-token"} "LSD",[],{"token":"test-lsd-token"}</script>
</head><body><main>stub</main></body></html>`;

async function getServiceWorker(context) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

async function readStorage(sw) {
  return sw.evaluate(() => chrome.storage.local.get(['blockQueue', 'cooldownEnd']));
}

test.describe('GraphQL rate limit', () => {
  test('enters 24h cooldown and keeps the item queued', async ({ context }) => {
    test.setTimeout(60000);

    const sw = await getServiceWorker(context);
    const extensionId = new URL(sw.url()).host;

    await injectFakeTokens(context);
    let graphqlCalls = 0;
    await context.route('https://www.threads.com/**', async (route) => {
      if (route.request().url().includes('/api/graphql')) {
        graphqlCalls++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponses.blockGraphqlRateLimit),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: STUB_PAGE });
    });

    // The threads.com tab hosts the content script that executes queued blocks
    const page = await context.newPage();
    await page.goto('https://www.threads.com/');
    await page.waitForSelector('#tb-shadow-host', { state: 'attached' });

    // Enqueue through the real SW message path; extension pages are allowed senders
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/manifest.json`);
    const startedAt = Date.now();
    await extPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'enqueueBlock', userId: '12345', username: 'spammer' })
    );

    // 1 attempt + 2 retries (3s, 5s), then cooldown
    await expect
      .poll(async () => (await readStorage(sw)).cooldownEnd ?? null, { timeout: 30000 })
      .not.toBeNull();

    const { blockQueue, cooldownEnd } = await readStorage(sw);
    expect(cooldownEnd - startedAt).toBeGreaterThan(COOLDOWN_MS - 60000);
    expect(cooldownEnd - startedAt).toBeLessThanOrEqual(COOLDOWN_MS + 60000);
    expect(blockQueue).toHaveLength(1);
    expect(blockQueue[0].state).toBe('queued');
    expect(graphqlCalls).toBe(3);

    // Cooldown holds: no further requests
    await page.waitForTimeout(4000);
    expect(graphqlCalls).toBe(3);
  });
});
