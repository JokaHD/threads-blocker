/**
 * npm run canary:login — open a real browser, let the user log in to
 * threads.com by hand, then persist the session (cookies + localStorage)
 * to gitignored .canary/state.json for the authed canary stages.
 *
 * No automated login: typing credentials programmatically is exactly the
 * bot pattern Meta's risk systems look for. Manual login in a headed
 * browser, done once, is the safe path.
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs';

const STATE_PATH = '.canary/state.json';
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log('打開 threads.com 登入頁 — 請在瀏覽器裡手動登入（IG 帳號）…');
await page.goto('https://www.threads.com/login');

const deadline = Date.now() + TIMEOUT_MS;
let loggedIn = false;
while (Date.now() < deadline) {
  const cookies = await context.cookies('https://www.threads.com');
  if (cookies.some((c) => c.name === 'sessionid' && c.value)) {
    loggedIn = true;
    break;
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

if (!loggedIn) {
  console.error(`超過 ${TIMEOUT_MS / 60000} 分鐘未偵測到登入（sessionid cookie），中止。`);
  await browser.close();
  throw new Error('login timeout');
}

// 登入剛完成時 server 可能還在補發 cookie，稍等再存
await new Promise((r) => setTimeout(r, 3000));
fs.mkdirSync('.canary', { recursive: true });
await context.storageState({ path: STATE_PATH });
await browser.close();

console.log(`✅ session 已存到 ${STATE_PATH}（gitignored，不會離開本機）`);
console.log('之後每天跑：npm run canary');
