/**
 * Shared helpers for canary specs: probe injection and local credential
 * (storage state) discovery. Credentials never leave the machine — the
 * state file lives in gitignored .canary/.
 */

import fs from 'node:fs';

export const STATE_PATH = '.canary/state.json';
export const PROBE_BUNDLE = '.canary/probe.bundle.js';

export function hasCredentials() {
  return fs.existsSync(STATE_PATH);
}

/**
 * Register the probe on a page. Must be called BEFORE page.goto —
 * addInitScript rides on CDP and is not subject to the page CSP.
 */
export async function installProbe(page) {
  await page.addInitScript({ path: PROBE_BUNDLE });
}

/**
 * Navigate and collect a probe snapshot. Waits for network to settle first:
 * threads.com hydrates the feed client-side, and probing a half-rendered
 * page would misreport selector misses as drift.
 */
export async function probePage(page, url) {
  await installProbe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  // data-pressable-container rows appear with hydration; give them a chance
  // before concluding they are gone. Timeout is tolerated: the probe itself
  // reports the final counts and the assertion message carries the details.
  await page
    .waitForSelector('[data-pressable-container]', { timeout: 15000, state: 'attached' })
    .catch(() => {});
  return page.evaluate(() => window.__tbCanary.run());
}
