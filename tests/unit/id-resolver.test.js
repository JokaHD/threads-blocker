/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

let mockFetchResponse;
let mockScripts = [];

global.fetch = jest.fn(() => Promise.resolve(mockFetchResponse));

const originalQuerySelectorAll = document.querySelectorAll.bind(document);
document.querySelectorAll = jest.fn((selector) => {
  if (selector === 'script') return mockScripts;
  return originalQuerySelectorAll(selector);
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
      // Mock data must match regex: "username":"X"[^}]*"(?:pk|id|user_id)":"Y"
      mockScripts = [{ textContent: '{"username":"testuser","pk":"99999"}' }];

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
