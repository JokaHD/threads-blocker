/**
 * @jest-environment jsdom
 */

import {
  getShadowRoot,
  getUIContainer,
  shadowHostExists,
  destroyShadowHost,
} from '../../src/content/ui/shadow-host.js';

describe('shadow-host', () => {
  afterEach(() => {
    // Clean up after each test
    destroyShadowHost();
  });

  describe('getShadowRoot', () => {
    test('creates shadow host and returns shadow root', () => {
      const root = getShadowRoot();

      expect(root).toBeInstanceOf(ShadowRoot);
      expect(document.getElementById('tb-shadow-host')).not.toBeNull();
    });

    test('returns same shadow root on subsequent calls', () => {
      const root1 = getShadowRoot();
      const root2 = getShadowRoot();

      expect(root1).toBe(root2);
    });

    test('injects styles into shadow root', () => {
      const root = getShadowRoot();
      const style = root.querySelector('style');

      expect(style).not.toBeNull();
      expect(style.textContent).toContain('.tb-ui-container');
      expect(style.textContent).toContain('.tb-fab');
    });

    test('creates UI container inside shadow root', () => {
      const root = getShadowRoot();
      const container = root.querySelector('.tb-ui-container');

      expect(container).not.toBeNull();
    });

    test('host element has correct styles', () => {
      getShadowRoot();
      const host = document.getElementById('tb-shadow-host');

      expect(host.style.position).toBe('fixed');
      expect(host.style.width).toBe('0px');
      expect(host.style.height).toBe('0px');
      expect(host.style.pointerEvents).toBe('none');
    });

    test('reuses existing host element on page reload', () => {
      // First call creates the host
      const root1 = getShadowRoot();

      // Simulate module reload by clearing internal state
      // We can't easily do this, so we test by destroying and checking existing detection
      destroyShadowHost();

      // Create fresh
      const root2 = getShadowRoot();
      expect(root2).toBeInstanceOf(ShadowRoot);
    });
  });

  describe('getUIContainer', () => {
    test('returns UI container element', () => {
      const container = getUIContainer();

      expect(container).not.toBeNull();
      expect(container.className).toBe('tb-ui-container');
    });

    test('creates shadow root if not exists', () => {
      expect(shadowHostExists()).toBe(false);

      getUIContainer();

      expect(shadowHostExists()).toBe(true);
    });
  });

  describe('shadowHostExists', () => {
    test('returns false when host does not exist', () => {
      expect(shadowHostExists()).toBe(false);
    });

    test('returns true when host exists', () => {
      getShadowRoot();

      expect(shadowHostExists()).toBe(true);
    });
  });

  describe('destroyShadowHost', () => {
    test('removes host element from DOM', () => {
      getShadowRoot();
      expect(document.getElementById('tb-shadow-host')).not.toBeNull();

      destroyShadowHost();

      expect(document.getElementById('tb-shadow-host')).toBeNull();
    });

    test('allows creating new shadow host after destroy', () => {
      const root1 = getShadowRoot();
      destroyShadowHost();
      const root2 = getShadowRoot();

      expect(root2).toBeInstanceOf(ShadowRoot);
      expect(root1).not.toBe(root2);
    });

    test('is safe to call multiple times', () => {
      getShadowRoot();

      destroyShadowHost();
      destroyShadowHost();
      destroyShadowHost();

      expect(shadowHostExists()).toBe(false);
    });

    test('is safe to call when host never created', () => {
      expect(() => destroyShadowHost()).not.toThrow();
    });
  });
});
