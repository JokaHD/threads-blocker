/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

let mockScripts = [];

// Mock querySelectorAll for scripts
const originalQuerySelectorAll = document.querySelectorAll.bind(document);
document.querySelectorAll = jest.fn((selector) => {
  if (selector === 'script') return mockScripts;
  return originalQuerySelectorAll(selector);
});

const { TokenProvider } = await import('../../src/content/token-provider.js');

beforeEach(() => {
  mockScripts = [];
  // Clear cookies
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});

describe('TokenProvider', () => {
  describe('getTokens', () => {
    it('extracts csrftoken from cookie', async () => {
      document.cookie = 'csrftoken=abc123';

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.csrftoken).toBe('abc123');
    });

    it('extracts URL-encoded csrftoken', async () => {
      document.cookie = 'csrftoken=abc%3D123';

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.csrftoken).toBe('abc=123');
    });

    it('throws if csrftoken not found', async () => {
      // No cookie set

      const provider = new TokenProvider();

      await expect(provider.getTokens()).rejects.toThrow(
        'Unable to extract csrftoken from cookies'
      );
    });

    it('extracts fb_dtsg from DTSGInitialData pattern', async () => {
      document.cookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg-token-123"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.fb_dtsg).toBe('dtsg-token-123');
    });

    it('extracts fb_dtsg from dtsg pattern', async () => {
      document.cookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: 'dtsg":{"token":"dtsg-alt-456"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.fb_dtsg).toBe('dtsg-alt-456');
    });

    it('extracts lsd from LSD pattern', async () => {
      document.cookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"LSD",[],{"token":"lsd-token-789"}' }];

      const provider = new TokenProvider();
      const tokens = await provider.getTokens();

      expect(tokens.lsd).toBe('lsd-token-789');
    });

    it('caches tokens after first call', async () => {
      document.cookie = 'csrftoken=csrf';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg"}' }];

      const provider = new TokenProvider();
      await provider.getTokens();

      // Change mock data - but cache should persist
      document.cookie = 'csrftoken=different';
      mockScripts = [];

      const tokens = await provider.getTokens();
      expect(tokens.csrftoken).toBe('csrf'); // Still cached
    });
  });

  describe('invalidate', () => {
    it('clears cached tokens', async () => {
      document.cookie = 'csrftoken=first';
      mockScripts = [{ textContent: '"DTSGInitialData",[],{"token":"dtsg"}' }];

      const provider = new TokenProvider();
      await provider.getTokens();

      document.cookie = 'csrftoken=second';
      provider.invalidate();

      const tokens = await provider.getTokens();
      expect(tokens.csrftoken).toBe('second');
    });
  });
});
