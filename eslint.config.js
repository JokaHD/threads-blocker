import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        ShadowRoot: 'readonly',
        MutationObserver: 'readonly',
        CustomEvent: 'readonly',
        MouseEvent: 'readonly',
        CSS: 'readonly',
        location: 'readonly',
        getComputedStyle: 'readonly',
        Promise: 'readonly',
        // Node globals (for config files)
        global: 'readonly',
        globalThis: 'readonly',
        // Chrome Extension APIs
        chrome: 'readonly',
        // Node/Web APIs
        URLSearchParams: 'readonly',
        // Jest globals
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prettier/prettier': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
