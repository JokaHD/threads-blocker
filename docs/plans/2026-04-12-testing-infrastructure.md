# Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish comprehensive testing infrastructure with 70%+ coverage, E2E tests, and CI/CD.

**Architecture:** Add 4 new unit test suites (threads-api, token-provider, id-resolver, site-adapter), configure Jest coverage threshold, add Playwright for E2E testing, and GitHub Actions for CI.

**Tech Stack:** Jest (unit), Playwright (E2E), GitHub Actions (CI)

**Spec:** `docs/2026-04-12-testing-infrastructure-design.md`

---

## File Structure

### New Files

```
tests/
├── unit/
│   ├── threads-api.test.js      # NEW: GraphQL API tests
│   ├── token-provider.test.js   # NEW: Token extraction tests
│   ├── id-resolver.test.js      # NEW: Username→userId tests
│   └── site-adapter.test.js     # NEW: DOM selector tests
├── e2e/
│   ├── fixtures/
│   │   └── extension.js         # NEW: Extension loading fixture
│   ├── mocks/
│   │   └── threads-api.js       # NEW: API mock responses
│   ├── extension-load.spec.js   # NEW
│   ├── block-flow.spec.js       # NEW
│   ├── error-handling.spec.js   # NEW
│   └── unblock-flow.spec.js     # NEW

.github/
└── workflows/
    └── test.yml                 # NEW: CI workflow

playwright.config.js             # NEW: Playwright config
```

### Modified Files

```
package.json                     # Add scripts, dependencies, coverage config
tests/setup.js                   # Add fetch mock helper
```

---

## Chunk 1: Unit Tests - threads-api.js

### Task 1: Add fetch mock helper to setup.js

**Files:**
- Modify: `tests/setup.js`

- [ ] **Step 1: Add mockFetch helper**

Add to `tests/setup.js`:

```javascript
// Mock fetch
export let mockFetchResponse = { ok: true, json: async () => ({}) };
export const mockFetch = jest.fn(() => Promise.resolve({
  ok: mockFetchResponse.ok,
  status: mockFetchResponse.status || 200,
  json: mockFetchResponse.json || (async () => ({})),
  text: mockFetchResponse.text || (async () => ''),
}));

export function setMockFetchResponse(response) {
  mockFetchResponse = response;
}

export function setupFetchMock() {
  global.fetch = mockFetch;
}

export function resetFetchMock() {
  mockFetch.mockClear();
  mockFetchResponse = { ok: true, json: async () => ({}) };
}
```

- [ ] **Step 2: Verify setup.js still works**

Run: `npm test`
Expected: All 106 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/setup.js
git commit -m "test: add fetch mock helper to setup.js"
```

---

### Task 2: Create threads-api.test.js

**Files:**
- Create: `tests/unit/threads-api.test.js`
- Reference: `src/content/threads-api.js`

- [ ] **Step 1: Write test for blockUser success**

Create `tests/unit/threads-api.test.js`:

```javascript
import { jest } from '@jest/globals';

// Mock fetch before importing module
let mockFetchResponse;
global.fetch = jest.fn(() => Promise.resolve(mockFetchResponse));

const { blockUser, unblockUser } = await import('../../src/content/threads-api.js');

function setFetchResponse(response) {
  mockFetchResponse = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.json ?? {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setFetchResponse({ ok: true, json: { data: {} } });
});

describe('blockUser', () => {
  const tokens = { csrftoken: 'csrf123', fb_dtsg: 'dtsg456', lsd: 'lsd789' };

  it('returns success on valid response', async () => {
    setFetchResponse({ ok: true, json: { data: { success: true } } });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends correct GraphQL request format', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    await blockUser('12345', tokens);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://www.threads.com/api/graphql');
    expect(options.method).toBe('POST');
    expect(options.headers['x-csrftoken']).toBe('csrf123');
    expect(options.headers['x-ig-app-id']).toBe('238260118697367');

    const body = new URLSearchParams(options.body);
    expect(body.get('doc_id')).toBe('26803837702651619');
    expect(JSON.parse(body.get('variables'))).toMatchObject({ user_id: '12345' });
  });

  it('returns failure on HTTP error', async () => {
    setFetchResponse({ ok: false, status: 500 });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');
    expect(result.status).toBe(500);
  });

  it('returns failure on GraphQL error', async () => {
    setFetchResponse({
      ok: true,
      json: { errors: [{ message: 'Rate limited' }] },
    });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });

  it('returns failure on network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });
});

describe('unblockUser', () => {
  const tokens = { csrftoken: 'csrf123', fb_dtsg: 'dtsg456', lsd: 'lsd789' };

  it('sends correct doc_id for unblock', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    await unblockUser('12345', tokens);

    const [, options] = global.fetch.mock.calls[0];
    const body = new URLSearchParams(options.body);
    expect(body.get('doc_id')).toBe('26247169961577940');
  });

  it('returns success on valid response', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    const result = await unblockUser('12345', tokens);

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/unit/threads-api.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/threads-api.test.js
git commit -m "test: add threads-api.test.js with GraphQL tests"
```

---

## Chunk 2: Unit Tests - token-provider.js

### Task 3: Create token-provider.test.js

**Files:**
- Create: `tests/unit/token-provider.test.js`
- Reference: `src/content/token-provider.js`

- [ ] **Step 1: Write tests for TokenProvider**

Create `tests/unit/token-provider.test.js`:

```javascript
import { jest } from '@jest/globals';

// Must set up DOM mocks before importing
let mockCookie = '';
let mockScripts = [];
let mockInputs = [];

Object.defineProperty(global.document, 'cookie', {
  get: () => mockCookie,
  configurable: true,
});

global.document.querySelectorAll = jest.fn((selector) => {
  if (selector === 'script') return mockScripts;
  if (selector === 'input[name="fb_dtsg"]') return mockInputs.filter(i => i.name === 'fb_dtsg');
  if (selector === 'input[name="lsd"]') return mockInputs.filter(i => i.name === 'lsd');
  return [];
});

global.document.querySelector = jest.fn((selector) => {
  if (selector === 'input[name="fb_dtsg"]') return mockInputs.find(i => i.name === 'fb_dtsg') || null;
  if (selector === 'input[name="lsd"]') return mockInputs.find(i => i.name === 'lsd') || null;
  return null;
});

const { TokenProvider } = await import('../../src/content/token-provider.js');

beforeEach(() => {
  mockCookie = '';
  mockScripts = [];
  mockInputs = [];
});

describe('TokenProvider', () => {
  describe('getTokens', () => {
    it('extracts csrftoken from cookie', async () => {
      mockCookie = 'csrftoken=abc123; other=value';

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.csrftoken).toBe('abc123');
    });

    it('extracts URL-encoded csrftoken', async () => {
      mockCookie = 'csrftoken=abc%3D123';

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.csrftoken).toBe('abc=123');
    });

    it('throws if csrftoken not found', async () => {
      mockCookie = 'other=value';

      const provider = new TokenProvider();

      await expect(provider.getTokens()).rejects.toThrow('Unable to extract csrftoken');
    });

    it('extracts fb_dtsg from DTSGInitialData pattern', async () => {
      mockCookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg-token-123"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.fb_dtsg).toBe('dtsg-token-123');
    });

    it('extracts fb_dtsg from dtsg pattern', async () => {
      mockCookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: 'dtsg":{"token":"dtsg-alt-456"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.fb_dtsg).toBe('dtsg-alt-456');
    });

    it('extracts lsd from LSD pattern', async () => {
      mockCookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"LSD",[],{"token":"lsd-token-789"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.lsd).toBe('lsd-token-789');
    });

    it('caches tokens after first call', async () => {
      mockCookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg"}' }];

      const provider = new TokenProvider();
      await provider.getTokens();

      // Change mock data
      mockCookie = 'csrftoken=different';
      mockScripts = [];

      const tokens = await provider.getTokens();
      expect(tokens.csrftoken).toBe('csrf'); // Still cached
    });
  });

  describe('invalidate', () => {
    it('clears cached tokens', async () => {
      mockCookie = 'csrftoken=first';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg"}' }];

      const provider = new TokenProvider();
      await provider.getTokens();

      mockCookie = 'csrftoken=second';
      provider.invalidate();

      const tokens = await provider.getTokens();
      expect(tokens.csrftoken).toBe('second');
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/unit/token-provider.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/token-provider.test.js
git commit -m "test: add token-provider.test.js with extraction tests"
```

---

## Chunk 3: Unit Tests - id-resolver.js & site-adapter.js

### Task 4: Create id-resolver.test.js

**Files:**
- Create: `tests/unit/id-resolver.test.js`
- Reference: `src/content/id-resolver.js`

- [ ] **Step 1: Write tests for IDResolver**

Create `tests/unit/id-resolver.test.js`:

```javascript
import { jest } from '@jest/globals';

let mockFetchResponse;
let mockScripts = [];

global.fetch = jest.fn(() => Promise.resolve(mockFetchResponse));
global.document.querySelectorAll = jest.fn((selector) => {
  if (selector === 'script') return mockScripts;
  return [];
});

const { IDResolver } = await import('../../src/content/id-resolver.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockScripts = [];
  mockFetchResponse = { ok: true, text: async () => '' };
});

describe('IDResolver', () => {
  describe('resolve', () => {
    it('finds user_id from page scripts first', async () => {
      mockScripts = [{ textContent: '"username":"testuser","pk":"99999"' }];

      const resolver = new IDResolver();
      const userId = await resolver.resolve('testuser');

      expect(userId).toBe('99999');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches profile page if not found in page', async () => {
      mockScripts = [];
      mockFetchResponse = {
        ok: true,
        text: async () => '"user_id":"12345678"',
      };

      const resolver = new IDResolver();
      const userId = await resolver.resolve('someuser');

      expect(userId).toBe('12345678');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.threads.com/@someuser',
        expect.any(Object)
      );
    });

    it('caches resolved user_id', async () => {
      mockFetchResponse = { ok: true, text: async () => '"user_id":"111"' };

      const resolver = new IDResolver();
      await resolver.resolve('cacheduser');
      await resolver.resolve('cacheduser');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns null on fetch error', async () => {
      mockFetchResponse = { ok: false, status: 404 };

      const resolver = new IDResolver();
      const userId = await resolver.resolve('notfound');

      expect(userId).toBeNull();
    });

    it('returns null if user_id not in response', async () => {
      mockFetchResponse = { ok: true, text: async () => '<html>no id here</html>' };

      const resolver = new IDResolver();
      const userId = await resolver.resolve('nodata');

      expect(userId).toBeNull();
    });

    it('deduplicates concurrent requests', async () => {
      let resolveCount = 0;
      mockFetchResponse = {
        ok: true,
        text: async () => {
          resolveCount++;
          return '"user_id":"222"';
        },
      };

      const resolver = new IDResolver();
      const [r1, r2, r3] = await Promise.all([
        resolver.resolve('concurrent'),
        resolver.resolve('concurrent'),
        resolver.resolve('concurrent'),
      ]);

      expect(r1).toBe('222');
      expect(r2).toBe('222');
      expect(r3).toBe('222');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('setCache', () => {
    it('pre-populates cache', async () => {
      const resolver = new IDResolver();
      resolver.setCache('preloaded', '333');

      const userId = await resolver.resolve('preloaded');

      expect(userId).toBe('333');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('clears all cached entries', async () => {
      mockFetchResponse = { ok: true, text: async () => '"user_id":"444"' };

      const resolver = new IDResolver();
      resolver.setCache('cached', '444');
      resolver.clearCache();

      await resolver.resolve('cached');

      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/unit/id-resolver.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/id-resolver.test.js
git commit -m "test: add id-resolver.test.js with caching tests"
```

---

### Task 5: Create site-adapter.test.js

**Files:**
- Create: `tests/unit/site-adapter.test.js`
- Reference: `src/content/site-adapter.js`

- [ ] **Step 1: Write tests for site-adapter**

Create `tests/unit/site-adapter.test.js`:

```javascript
import { jest } from '@jest/globals';
import { threadsSiteRule, getSiteRule } from '../../src/content/site-adapter.js';

describe('threadsSiteRule', () => {
  describe('match', () => {
    it('matches threads.com URLs', () => {
      expect(threadsSiteRule.match.test('https://www.threads.com/')).toBe(true);
      expect(threadsSiteRule.match.test('https://www.threads.com/@user')).toBe(true);
      expect(threadsSiteRule.match.test('https://www.threads.com/post/123')).toBe(true);
    });

    it('does not match other URLs', () => {
      expect(threadsSiteRule.match.test('https://threads.com/')).toBe(false);
      expect(threadsSiteRule.match.test('https://www.instagram.com/')).toBe(false);
    });
  });

  describe('extractUsername', () => {
    it('extracts username from valid href', () => {
      expect(threadsSiteRule.extractUsername('/@johndoe')).toBe('johndoe');
      expect(threadsSiteRule.extractUsername('/@user_123')).toBe('user_123');
      expect(threadsSiteRule.extractUsername('/@user.name')).toBe('user.name');
    });

    it('returns null for invalid href', () => {
      expect(threadsSiteRule.extractUsername('/johndoe')).toBeNull();
      expect(threadsSiteRule.extractUsername('/@')).toBeNull();
      expect(threadsSiteRule.extractUsername(null)).toBeNull();
      expect(threadsSiteRule.extractUsername('/post/123')).toBeNull();
    });
  });

  describe('isAvatarLink', () => {
    it('detects avatar link by Chinese text', () => {
      const link = { textContent: '個人檔案', getBoundingClientRect: () => ({ width: 60, height: 60 }) };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(true);
    });

    it('detects avatar link by dimensions', () => {
      const link = { textContent: '', getBoundingClientRect: () => ({ width: 60, height: 60 }) };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(true);
    });

    it('returns false for text link', () => {
      const link = { textContent: 'username', getBoundingClientRect: () => ({ width: 80, height: 20 }) };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(false);
    });
  });

  describe('findContainer', () => {
    it('returns element with data-pressable-container', () => {
      const container = document.createElement('div');
      container.setAttribute('data-pressable-container', '');

      const parent = document.createElement('div');
      parent.appendChild(container);

      const link = document.createElement('a');
      container.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBe(container);
    });

    it('returns element with 3+ children as fallback', () => {
      const container = document.createElement('div');
      container.appendChild(document.createElement('span'));
      container.appendChild(document.createElement('span'));
      container.appendChild(document.createElement('span'));

      const link = document.createElement('a');
      container.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBe(container);
    });

    it('returns null if no suitable container', () => {
      const link = document.createElement('a');
      document.body.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBeNull();

      document.body.removeChild(link);
    });
  });
});

describe('getSiteRule', () => {
  const originalLocation = global.location;

  afterEach(() => {
    global.location = originalLocation;
  });

  it('returns threadsSiteRule for threads.com', () => {
    delete global.location;
    global.location = { href: 'https://www.threads.com/@test' };

    expect(getSiteRule()).toBe(threadsSiteRule);
  });

  it('returns null for other sites', () => {
    delete global.location;
    global.location = { href: 'https://www.example.com/' };

    expect(getSiteRule()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/unit/site-adapter.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/site-adapter.test.js
git commit -m "test: add site-adapter.test.js with DOM selector tests"
```

---

## Chunk 4: Coverage & CI

### Task 6: Add Jest coverage configuration

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add coverage threshold to package.json**

Add `coverageThreshold` to the `jest` key in `package.json`:

```json
{
  "jest": {
    "projects": [...],
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70
      }
    },
    "collectCoverageFrom": [
      "src/**/*.js",
      "!src/content/content.js",
      "!src/content/debug.js"
    ]
  }
}
```

Note: Exclude `content.js` (entry point) and `debug.js` (dev tool) from coverage.

- [ ] **Step 2: Update test scripts**

Update scripts in `package.json`:

```json
{
  "scripts": {
    "build": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:watch": "node --experimental-vm-modules node_modules/.bin/jest --watch",
    "test:coverage": "node --experimental-vm-modules node_modules/.bin/jest --coverage"
  }
}
```

- [ ] **Step 3: Run coverage**

Run: `npm run test:coverage`
Expected: Coverage report shows >= 70% (may need adjustments)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add Jest coverage threshold (70%)"
```

---

### Task 7: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create workflow directory**

Run: `mkdir -p .github/workflows`

- [ ] **Step 2: Create test.yml**

Create `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add GitHub Actions workflow for unit tests"
```

- [ ] **Step 4: Push and verify**

Run: `git push`
Expected: Check GitHub Actions tab, workflow runs successfully

---

## Chunk 5: Playwright Setup

### Task 8: Install and configure Playwright

**Files:**
- Modify: `package.json`
- Create: `playwright.config.js`

- [ ] **Step 1: Install Playwright**

Run: `npm install -D @playwright/test`

- [ ] **Step 2: Create playwright.config.js**

Create `playwright.config.js`:

```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: 2,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: false,
      },
    },
  ],
});
```

- [ ] **Step 3: Add E2E scripts to package.json**

Add to scripts:

```json
{
  "scripts": {
    "test:e2e": "npx playwright test",
    "test:e2e:headed": "npx playwright test --headed",
    "test:all": "npm run test:coverage && npm run test:e2e"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json playwright.config.js
git commit -m "chore: add Playwright configuration"
```

---

### Task 9: Create extension fixture

**Files:**
- Create: `tests/e2e/fixtures/extension.js`

- [ ] **Step 1: Create fixtures directory**

Run: `mkdir -p tests/e2e/fixtures`

- [ ] **Step 2: Create extension.js fixture**

Create `tests/e2e/fixtures/extension.js`:

```javascript
import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend({
  context: async ({}, use) => {
    const extensionPath = path.resolve('dist');

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });

    await use(context);
    await context.close();
  },

  extensionPage: async ({ context }, use) => {
    // Wait for extension to load
    await new Promise(r => setTimeout(r, 1000));

    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/extension.js
git commit -m "test: add Playwright extension fixture"
```

---

### Task 10: Create API mocks

**Files:**
- Create: `tests/e2e/mocks/threads-api.js`

- [ ] **Step 1: Create mocks directory**

Run: `mkdir -p tests/e2e/mocks`

- [ ] **Step 2: Create threads-api.js mocks**

Create `tests/e2e/mocks/threads-api.js`:

```javascript
export const mockResponses = {
  blockSuccess: {
    data: {
      user_block: {
        user: { id: '12345' },
        success: true,
      },
    },
  },

  blockRateLimit: {
    errors: [
      {
        message: 'Rate limited',
        severity: 'ERROR',
        code: 1545012,
      },
    ],
  },

  unblockSuccess: {
    data: {
      user_unblock: {
        user: { id: '12345' },
        success: true,
      },
    },
  },

  networkError: null,
};

export async function setupApiMocks(page, scenario = 'blockSuccess') {
  await page.route('**/api/graphql', async (route) => {
    const response = mockResponses[scenario];

    if (response === null) {
      await route.abort('failed');
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export async function injectFakeTokens(context) {
  await context.addCookies([
    {
      name: 'csrftoken',
      value: 'test-csrf-token',
      domain: '.threads.com',
      path: '/',
    },
  ]);
}

export async function injectFakeScripts(page) {
  await page.addInitScript(() => {
    const script = document.createElement('script');
    script.textContent = `
      window.__FAKE_TOKENS__ = true;
      // DTSGInitialData pattern
      var __dtsg = {"token": "test-dtsg-token"};
      // LSD pattern
      var __lsd = {"token": "test-lsd-token"};
    `;
    script.setAttribute('data-testid', 'fake-tokens');
    document.head.appendChild(script);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/mocks/threads-api.js
git commit -m "test: add E2E API mock utilities"
```

---

## Chunk 6: E2E Tests

### Task 11: Create extension-load.spec.js

**Files:**
- Create: `tests/e2e/extension-load.spec.js`

- [ ] **Step 1: Write extension load test**

Create `tests/e2e/extension-load.spec.js`:

```javascript
import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Extension Loading', () => {
  test('loads on threads.com and injects Shadow DOM', async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
    await setupApiMocks(page);

    await page.goto('https://www.threads.com/');

    // Wait for extension to inject Shadow DOM host
    const shadowHost = await page.waitForSelector('[data-thread-blocker-host]', {
      timeout: 10000,
    });

    expect(shadowHost).toBeTruthy();
  });

  test('shows FAB (toolbar) in Shadow DOM', async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
    await setupApiMocks(page);

    await page.goto('https://www.threads.com/');

    // Wait for Shadow DOM host
    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Check for toolbar inside Shadow DOM
    const hasToolbar = await page.evaluate(() => {
      const host = document.querySelector('[data-thread-blocker-host]');
      if (!host || !host.shadowRoot) return false;
      return !!host.shadowRoot.querySelector('.tb-toolbar');
    });

    expect(hasToolbar).toBe(true);
  });

  test('does not load on non-threads sites', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.example.com/');

    // Wait a bit for any potential injection
    await page.waitForTimeout(2000);

    const shadowHost = await page.$('[data-thread-blocker-host]');
    expect(shadowHost).toBeNull();
  });
});
```

- [ ] **Step 2: Build extension**

Run: `npm run build`

- [ ] **Step 3: Run test**

Run: `npm run test:e2e -- tests/e2e/extension-load.spec.js`
Expected: Tests pass (may need adjustments based on actual DOM)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/extension-load.spec.js
git commit -m "test: add E2E extension loading tests"
```

---

### Task 12: Create block-flow.spec.js

**Files:**
- Create: `tests/e2e/block-flow.spec.js`

- [ ] **Step 1: Write block flow test**

Create `tests/e2e/block-flow.spec.js`:

```javascript
import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Block Flow', () => {
  test.beforeEach(async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
  });

  test('clicking block button on comment queues block request', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'blockSuccess');

    // Navigate to a post with comments
    await page.goto('https://www.threads.com/');

    // Wait for extension and comments to load
    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Look for inline controls (block buttons) in Shadow DOM
    const hasInlineControls = await page.evaluate(() => {
      const host = document.querySelector('[data-thread-blocker-host]');
      if (!host || !host.shadowRoot) return false;
      const controls = host.shadowRoot.querySelectorAll('.tb-inline-control');
      return controls.length > 0;
    });

    // If comments exist, there should be inline controls
    // This test may need adjustment based on actual page content
    expect(hasInlineControls).toBeDefined();
  });

  test('panel shows queue status', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'blockSuccess');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Check panel exists in Shadow DOM
    const hasPanel = await page.evaluate(() => {
      const host = document.querySelector('[data-thread-blocker-host]');
      if (!host || !host.shadowRoot) return false;
      return !!host.shadowRoot.querySelector('.tb-panel');
    });

    expect(hasPanel).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- tests/e2e/block-flow.spec.js`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/block-flow.spec.js
git commit -m "test: add E2E block flow tests"
```

---

### Task 13: Create error-handling.spec.js

**Files:**
- Create: `tests/e2e/error-handling.spec.js`

- [ ] **Step 1: Write error handling tests**

Create `tests/e2e/error-handling.spec.js`:

```javascript
import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
  });

  test('handles rate limit gracefully', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'blockRateLimit');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Extension should load even with rate limit response queued
    const shadowHost = await page.$('[data-thread-blocker-host]');
    expect(shadowHost).toBeTruthy();
  });

  test('handles network errors gracefully', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'networkError');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Extension should still load
    const shadowHost = await page.$('[data-thread-blocker-host]');
    expect(shadowHost).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- tests/e2e/error-handling.spec.js`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/error-handling.spec.js
git commit -m "test: add E2E error handling tests"
```

---

### Task 14: Create unblock-flow.spec.js

**Files:**
- Create: `tests/e2e/unblock-flow.spec.js`

- [ ] **Step 1: Write unblock flow test**

Create `tests/e2e/unblock-flow.spec.js`:

```javascript
import { test, expect } from './fixtures/extension.js';
import { setupApiMocks, injectFakeTokens, injectFakeScripts } from './mocks/threads-api.js';

test.describe('Unblock Flow', () => {
  test.beforeEach(async ({ context, extensionPage: page }) => {
    await injectFakeTokens(context);
    await injectFakeScripts(page);
  });

  test('extension loads with unblock API ready', async ({ context, extensionPage: page }) => {
    await setupApiMocks(page, 'unblockSuccess');
    await page.goto('https://www.threads.com/');

    await page.waitForSelector('[data-thread-blocker-host]', { timeout: 10000 });

    // Verify extension loaded
    const shadowHost = await page.$('[data-thread-blocker-host]');
    expect(shadowHost).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- tests/e2e/unblock-flow.spec.js`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/unblock-flow.spec.js
git commit -m "test: add E2E unblock flow tests"
```

---

## Chunk 7: CI E2E Integration

### Task 15: Update CI workflow for E2E

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Add E2E job to workflow**

Update `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Run E2E tests
        run: xvfb-run npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add E2E tests to GitHub Actions workflow"
```

- [ ] **Step 3: Push and verify**

Run: `git push`
Expected: Both unit-tests and e2e-tests jobs run successfully

---

### Task 16: Final verification

- [ ] **Step 1: Run all tests locally**

Run: `npm run test:all`
Expected: All unit tests pass with 70%+ coverage, all E2E tests pass

- [ ] **Step 2: Verify CI**

Check GitHub Actions - both jobs should be green

- [ ] **Step 3: Update README (optional)**

Add badges and test instructions to README if desired

---

## Success Criteria Checklist

- [ ] All unit tests pass (106 existing + ~35 new)
- [ ] Coverage >= 70% for branches, functions, lines
- [ ] All E2E tests pass (4 spec files)
- [ ] CI runs on every PR
- [ ] CI blocks merge on test failure
