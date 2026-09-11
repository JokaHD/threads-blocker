/**
 * INFRA stage — is threads.com reachable at all from this machine?
 * Failures here mean network/environment problems, NOT site drift;
 * every other stage depends on this project and is skipped when it fails.
 */

import { test, expect } from '@playwright/test';

test('threads.com 可達且停留在 www.threads.com', async ({ page }) => {
  const response = await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' });

  expect(response, '沒有收到任何 HTTP 回應（網路不通？）').toBeTruthy();
  expect(response.status(), `HTTP status ${response.status()} — 站台異常或被擋`).toBeLessThan(400);

  const hostname = new URL(page.url()).hostname;
  expect(hostname, `被導向到 ${hostname} — 網域或路由行為改變`).toBe('www.threads.com');

  await expect(page.locator('body')).toBeAttached();
});
