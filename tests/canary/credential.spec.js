/**
 * CREDENTIAL stage — is the locally stored session still valid?
 * Failures here mean「重新跑 npm run canary:login」, NOT site drift.
 * contract-authed depends on this project: an expired session skips the
 * logged-in contract checks instead of misreporting them as drift.
 */

import { test, expect } from '@playwright/test';
import { STATE_PATH, hasCredentials } from './fixtures/probe.js';

test.describe('credential', () => {
  test.skip(!hasCredentials(), `憑證檔 ${STATE_PATH} 不存在 — 跑 npm run canary:login 建立`);
  test.use({ storageState: STATE_PATH });

  // Only the sessionid cookie decides validity. Token extraction (fb_dtsg)
  // is a contract item checked in contract-authed: gating on it here would
  // misreport a DTSG format change as an expired session, forever.
  test('本機 session 仍為登入狀態', async ({ page, context }) => {
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' });

    const cookies = await context.cookies('https://www.threads.com');
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' && c.value);
    expect(
      sessionCookie,
      'sessionid cookie 已消失 — session 被登出，重跑 npm run canary:login'
    ).toBeTruthy();
  });
});
