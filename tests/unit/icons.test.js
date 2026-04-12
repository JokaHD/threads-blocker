/**
 * @jest-environment jsdom
 */

import { Icons } from '../../src/content/ui/icons.js';

describe('Icons', () => {
  test('exports all required icons', () => {
    const requiredIcons = [
      'ban', 'x', 'check', 'loader', 'undo',
      'alertTriangle', 'refreshCw', 'shield', 'minus', 'pause', 'play'
    ];

    for (const name of requiredIcons) {
      expect(Icons[name]).toBeDefined();
      expect(typeof Icons[name]).toBe('string');
    }
  });

  test('icons are valid SVG strings', () => {
    for (const [name, svg] of Object.entries(Icons)) {
      expect(svg).toMatch(/^<svg.*<\/svg>$/);
      expect(svg).toContain('viewBox="0 0 24 24"');
    }
  });

  test('icons have consistent size attributes', () => {
    for (const svg of Object.values(Icons)) {
      expect(svg).toContain('width="18"');
      expect(svg).toContain('height="18"');
    }
  });

  test('loader icon has spin class', () => {
    expect(Icons.loader).toContain('class="tb-spin"');
  });
});
