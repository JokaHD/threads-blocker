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
  // URL is set to https://www.threads.com/@test via testEnvironmentOptions
  it('returns threadsSiteRule for threads.com (current environment)', () => {
    expect(getSiteRule()).toBe(threadsSiteRule);
  });

  // Test match regex directly for other URL scenarios
  it('match regex returns true for threads.com URLs', () => {
    expect(threadsSiteRule.match.test('https://www.threads.com/')).toBe(true);
    expect(threadsSiteRule.match.test('https://www.threads.com/@user')).toBe(true);
  });

  it('match regex returns false for other URLs', () => {
    expect(threadsSiteRule.match.test('https://www.example.com/')).toBe(false);
    expect(threadsSiteRule.match.test('https://threads.net/')).toBe(false);
  });
});
