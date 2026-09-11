/**
 * CONTRACT stage (public) — the site contract checked WITHOUT login.
 * Every assertion here encodes one assumption the extension makes about
 * threads.com; a failure means the site changed (= drift), because infra
 * reachability was already verified upstream.
 *
 * expect.soft is used throughout: one navigation reports every broken
 * contract item at once instead of stopping at the first.
 */

import { test, expect } from '@playwright/test';
import { probePage } from './fixtures/probe.js';

test.describe('contract: 首頁 feed（未登入）', () => {
  test('selector 與 token 來源逐項命中', async ({ page }) => {
    const s = await probePage(page, 'https://www.threads.com/');

    expect.soft(s.ruleMatched, `site rule URL pattern 不再匹配（目前 URL: ${s.url}）`).toBe(true);

    expect
      .soft(
        s.usernameLinks.valid,
        `username 連結 a[href^="/@"] 命中 ${s.usernameLinks.valid}/${s.usernameLinks.total}（loginWall=${s.loginWall}）— username selector 或 href 格式已改`
      )
      .toBeGreaterThan(0);

    expect
      .soft(
        s.pressableOnPage,
        'data-pressable-container 在頁面上完全消失 — 容器定位的 priority 1 anchor 已被移除'
      )
      .toBeGreaterThan(0);

    expect
      .soft(
        s.containers.pressable,
        `findContainer 的 priority 1 命中 0（fallback 命中 ${s.containers.fallback}、miss ${s.containers.miss}）— 目前靠啟發式 fallback 撐著，要儘快修 site-adapter`
      )
      .toBeGreaterThan(0);

    expect
      .soft(s.tokens.csrftoken, 'csrftoken cookie 不存在 — token-provider 的 CSRF 來源已改')
      .toBe(true);

    expect
      .soft(s.tokens.lsd, 'LSD token 無法從頁面 script 抽出 — token-provider 的 LSD pattern 已失效')
      .toBe(true);

    // navPresent 不在此驗：未登入版面沒有 nav（實測 2026-09-12），登入態 spec 才驗

    expect.soft(s.uiVisible, '首頁 path 不再被 SUPPORTED_PATH_PATTERNS 視為支援頁面').toBe(true);
  });
});

test.describe('contract: profile 頁（未登入）', () => {
  test('/@threads 官方帳號頁結構仍符合預期', async ({ page }) => {
    const s = await probePage(page, 'https://www.threads.com/@threads');

    expect
      .soft(
        s.usernameLinks.valid,
        `profile 頁 username 連結命中 ${s.usernameLinks.valid}（loginWall=${s.loginWall}）`
      )
      .toBeGreaterThan(0);

    expect.soft(s.pressableOnPage, 'profile 頁上 data-pressable-container 消失').toBeGreaterThan(0);

    expect.soft(s.uiVisible, '/@user path 不再被視為支援頁面').toBe(true);
  });
});

test.describe('contract: 路由存活', () => {
  test('/search 路由仍存在且屬支援頁面', async ({ page }) => {
    const s = await probePage(page, 'https://www.threads.com/search');

    const pathname = new URL(s.url).pathname;
    expect
      .soft(
        pathname.startsWith('/search') || pathname === '/login',
        `/search 被導向 ${pathname} — 路由已改`
      )
      .toBe(true);

    expect.soft(s.pathSupported, '/search path 不再匹配 SUPPORTED_PATH_PATTERNS').toBe(true);
  });
});
