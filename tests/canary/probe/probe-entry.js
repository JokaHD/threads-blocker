/**
 * Canary probe — bundled by global-setup and injected into the real
 * threads.com page. Runs the ACTUAL shipped adapter/token logic (imported
 * from src/), so the canary can never drift apart from the extension itself.
 *
 * Exposes window.__tbCanary.run() returning a JSON-serializable snapshot;
 * all assertions live on the test side where failures get readable messages.
 */

import { threadsSiteRule } from '../../../src/content/site-adapter.js';
import { TokenProvider } from '../../../src/content/token-provider.js';

function run() {
  const rule = threadsSiteRule;

  const links = [...document.querySelectorAll(rule.usernameSelector)];
  const valid = links.filter((link) => rule.extractUsername(link.getAttribute('href')));
  const scannable = valid.filter((link) => !rule.shouldExcludeLink(link));

  // Container resolution per scannable link: findContainer() is the shipped
  // walk; whether the result carries data-pressable-container tells us if
  // priority 1 hit or we are surviving on the size/child-count fallback.
  const containers = { pressable: 0, fallback: 0, miss: 0 };
  for (const link of scannable) {
    const container = rule.findContainer(link);
    if (!container) containers.miss++;
    else if (container.hasAttribute('data-pressable-container')) containers.pressable++;
    else containers.fallback++;
  }

  const tokenProvider = new TokenProvider();

  return {
    url: location.href,
    ruleMatched: rule.match.test(location.href),
    usernameLinks: {
      total: links.length,
      valid: valid.length,
      scannable: scannable.length,
    },
    containers,
    pressableOnPage: document.querySelectorAll('[data-pressable-container]').length,
    dialogsOnPage: document.querySelectorAll('[role="dialog"], dialog').length,
    tokens: {
      // booleans only — never expose token values in reports/traces
      csrftoken: !!tokenProvider._getCsrfToken(),
      fb_dtsg: !!tokenProvider._getFbDtsg(),
      lsd: !!tokenProvider._getLsd(),
    },
    navPresent: !!document.querySelector('nav, [role="navigation"]'),
    pathSupported: rule.isSupportedPath(location.pathname),
    uiVisible: rule.isUIVisibleOnUrl(location.href),
    theme: rule.getTheme(),
    // diagnostic only: a password field suggests we landed on a login wall
    loginWall: !!document.querySelector('input[type="password"]'),
  };
}

window.__tbCanary = { run };
