/**
 * CONTRACT stage (extension smoke) — the shipped extension, loaded from
 * dist/, must still boot on the real threads.com page. This is the
 * end-to-end confirmation that the page-level contract items compose:
 * content script boot → site rule match → shadow host mount → FAB render →
 * dom-observer marking comments.
 *
 * The shadow root is `mode: 'closed'`, so page-context querySelector can
 * never see the UI — state is read through the tb-debug event bridge that
 * debug.js installs in the content script world (DOM events cross worlds).
 *
 * GraphQL is route-mocked so the smoke never fires real mutations.
 */

import { test, expect } from '../e2e/fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from '../e2e/mocks/threads-api.js';

function askDebugBridge(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('tb-debug bridge 無回應')), 5000);
        window.addEventListener(
          'tb-debug:state',
          (e) => {
            clearTimeout(timer);
            resolve(JSON.parse(e.detail));
          },
          { once: true }
        );
        window.dispatchEvent(new CustomEvent('tb-debug:request'));
      })
  );
}

test('extension 在真站仍可掛載 Shadow DOM UI 並標記留言', async ({
  context,
  extensionPage: page,
}) => {
  await injectFakeTokens(context);
  await injectFakeScripts(page);
  await setupApiMocks(page);

  await page.goto('https://www.threads.com/');

  const shadowHost = await page.waitForSelector('#tb-shadow-host', {
    timeout: 15000,
    state: 'attached',
  });
  expect(
    shadowHost,
    '#tb-shadow-host 未掛載 — content script 啟動或掛載流程對真站失效'
  ).toBeTruthy();

  // UI 初始化與留言標記在 host 掛載後非同步發生 — poll bridge 直到就緒
  await expect
    .poll(async () => (await askDebugBridge(page)).ui.fab, {
      timeout: 15000,
      message: 'FAB 未渲染（透過 tb-debug bridge 觀測）— UI 初始化對真站失效',
    })
    .toBe(true);

  const state = await askDebugBridge(page);
  expect.soft(state.siteRule, 'site rule 未匹配').toBe('threads');
  expect.soft(state.shadowHost.hasRoot, 'shadow root 不存在').toBe(true);
  expect
    .soft(state.comments.marked, 'dom-observer 在真站 feed 上標記到 0 則留言 — 偵測管線失效')
    .toBeGreaterThan(0);
});
