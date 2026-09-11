/**
 * CONTRACT stage (authed) — contract items that need a logged-in session.
 * Runs only when the credential stage passed (Playwright project
 * dependency), so failures here are drift, not an expired session.
 */

import { test, expect } from '@playwright/test';
import { STATE_PATH, hasCredentials, probePage } from './fixtures/probe.js';

test.describe('contract: 登入態', () => {
  test.skip(!hasCredentials(), `憑證檔 ${STATE_PATH} 不存在 — 跑 npm run canary:login 建立`);
  test.use({ storageState: STATE_PATH });

  test('登入態 feed 的 selector 與完整 token 組合', async ({ page }) => {
    const s = await probePage(page, 'https://www.threads.com/');

    expect
      .soft(s.usernameLinks.valid, `登入態 feed username 連結命中 ${s.usernameLinks.valid}`)
      .toBeGreaterThan(0);

    expect
      .soft(
        s.containers.pressable,
        `登入態 findContainer priority 1 命中 0（fallback ${s.containers.fallback}、miss ${s.containers.miss}）`
      )
      .toBeGreaterThan(0);

    // block/unblock mutation 需要的三件套必須同時抽得到
    expect.soft(s.tokens.csrftoken, '登入態 csrftoken cookie 不存在').toBe(true);
    expect.soft(s.tokens.fb_dtsg, '登入態 fb_dtsg 抽取失敗 — DTSG pattern 已改').toBe(true);
    expect.soft(s.tokens.lsd, '登入態 LSD 抽取失敗 — LSD pattern 已改').toBe(true);

    expect.soft(s.navPresent, '登入態導覽列 nav / [role="navigation"] 不存在').toBe(true);
  });
});
