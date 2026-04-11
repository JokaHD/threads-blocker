// Bootstrap file: makes jest available as a global for setup.js
// This runs in the Jest environment where jest globals are injected,
// but we explicitly attach jest to globalThis so ESM modules can use it.
import { jest as jestGlobal } from '@jest/globals';
globalThis.jest = jestGlobal;
