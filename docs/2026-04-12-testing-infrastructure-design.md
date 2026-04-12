# Testing Infrastructure Design

Date: 2026-04-12

## Overview

Establish a comprehensive testing infrastructure for Threads Blocker with:
- Unit test coverage at 70%+
- E2E testing with Playwright
- GitHub Actions CI/CD

## Goals

1. Ensure code quality through automated testing
2. Catch regressions before merge
3. Enable confident refactoring
4. Document expected behavior through tests

## Unit Tests

### Current State
- 106 tests across 6 suites (all passing)
- Covered: persistence, rate-limit-handler, selection-manager, queue-manager, dom-observer, api-executor

### New Test Suites

| Module | Test Focus | Priority |
|--------|------------|----------|
| `threads-api.js` | GraphQL request format, success/failure response handling, HTTP errors | High |
| `token-provider.js` | Cookie extraction, script parsing, token caching/invalidation | High |
| `id-resolver.js` | username → userId resolution | Medium |
| `site-adapter.js` | DOM selectors, comment detection | Medium |

### Test Strategy
- Use existing `tests/setup.js` mock architecture
- Mock `fetch` for `threads-api.js`
- Mock `document.cookie` and `document.querySelectorAll` for `token-provider.js`

### Coverage Configuration

Add to `package.json` under the `jest` key:

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70
      }
    }
  }
}
```

## E2E Tests

### Framework
Playwright - chosen for:
- Native Chrome Extension support
- Cross-browser capability
- Built-in waiting mechanisms

### Directory Structure

```
tests/e2e/
├── fixtures/
│   └── extension.js      # Extension loading fixture
├── mocks/
│   └── threads-api.js    # API mock responses
├── extension-load.spec.js
├── block-flow.spec.js
├── error-handling.spec.js
└── unblock-flow.spec.js
```

Note: Using `.js` files for consistency with the project (pure JavaScript, no TypeScript).

### Extension Fixture

```typescript
import { test as base, chromium } from '@playwright/test';

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=./dist`,
        `--load-extension=./dist`,
      ],
    });
    await use(context);
    await context.close();
  },
});
```

### Mock API Strategy

Intercept all requests to `threads.com/api/graphql` and return mock responses:

```typescript
export const mockGraphQL = {
  blockSuccess: { data: { user_block: { success: true } } },
  blockRateLimit: { errors: [{ message: 'Rate limited' }] },
  unblockSuccess: { data: { user_unblock: { success: true } } },
};

await page.route('**/api/graphql', route => {
  route.fulfill({ json: mockGraphQL.blockSuccess });
});
```

### Token Injection

```typescript
// Inject fake cookie
await context.addCookies([
  { name: 'csrftoken', value: 'test-csrf', domain: '.threads.com', path: '/' }
]);

// Inject fake script for TokenProvider
await page.addInitScript(() => {
  const script = document.createElement('script');
  script.textContent = '"DTSGInitialData",[],{"token":"test-dtsg"}';
  document.head.appendChild(script);
});
```

### Test Cases

| File | Tests |
|------|-------|
| `extension-load.spec.ts` | Extension loads, Shadow DOM injected, FAB appears |
| `block-flow.spec.ts` | Select comment → confirm block → status updates (queued → blocked) |
| `error-handling.spec.ts` | Rate limit → cooldown display, network error → retry |
| `unblock-flow.spec.ts` | Blocked user → click unblock → status restored |

### Test Page Strategy

Visit real `threads.com` with all API requests intercepted. This ensures:
- DOM structure is always current
- No fixture maintenance required
- Real user flow testing

**Network Reliability Considerations:**
- Configure timeout (60s default) for slow connections
- Retry failed tests (2 retries) for flaky network conditions
- Abort navigation on persistent failure with clear error message

### Playwright Configuration

Create `playwright.config.js` in project root:

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
        // Extension requires headed mode
        headless: false,
      },
    },
  ],
});
```

## GitHub Actions CI

### Workflow

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
      - run: npm ci
      - run: npm run test:coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npx playwright install chromium --with-deps
      # Chrome extensions require headed mode; use xvfb for virtual display
      - run: xvfb-run npm run test:e2e
```

## Package.json Updates

### New Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.44.0"
  }
}
```

### New Scripts

Note: Project uses ES modules, so Jest requires `--experimental-vm-modules` flag.

```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:coverage": "node --experimental-vm-modules node_modules/.bin/jest --coverage",
    "test:e2e": "npx playwright test",
    "test:e2e:headed": "npx playwright test --headed",
    "test:all": "npm run test:coverage && npm run test:e2e"
  }
}
```

## Implementation Order

1. **Unit tests** - Add threads-api, token-provider, id-resolver, site-adapter tests
2. **Coverage config** - Add Jest coverage threshold (70%)
3. **GitHub Actions** - Create CI workflow for unit tests
4. **Playwright setup** - Install, configure, create extension fixture
5. **E2E tests** - Implement 4 spec files
6. **CI E2E integration** - Add Playwright to workflow

## Success Criteria

- [ ] All unit tests pass
- [ ] Coverage >= 70% for branches, functions, lines
- [ ] All E2E tests pass
- [ ] CI runs on every PR
- [ ] CI blocks merge on test failure
