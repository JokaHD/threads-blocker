/**
 * CREDENTIAL stage — is the locally stored session still valid?
 * Failures here mean「重新跑 npm run canary:login」, NOT site drift.
 * contract-authed depends on this project: an expired session skips the
 * logged-in contract checks instead of misreporting them as drift.
 */

import { test, expect } from '@playwright/test';
import { STATE_PATH, hasCredentials, probePage } from './fixtures/probe.js';

test.describe('credential', () => {
  test.skip(!hasCredentials(), `憑證檔 ${STATE_PATH} 不存在 — 跑 npm run canary:login 建立`);
  test.use({ storageState: STATE_PATH });

  test('本機 session 仍為登入狀態', async ({ page, context }) => {
    const snapshot = await probePage(page, 'https://www.threads.com/');

    const cookies = await context.cookies('https://www.threads.com');
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' && c.value);
    expect(
      sessionCookie,
      'sessionid cookie 已消失 — session 被登出，重跑 npm run canary:login'
    ).toBeTruthy();

    // fb_dtsg 只發給登入中的 session：抽不到即視為憑證過期
    expect(
      snapshot.tokens.fb_dtsg,
      'fb_dtsg 抽取失敗 — session 已過期（先重跑 npm run canary:login 再判斷是否為 drift）'
    ).toBe(true);
  });
});
