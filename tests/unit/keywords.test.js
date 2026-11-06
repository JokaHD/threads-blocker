import {
  normalizeKeyword,
  isDuplicate,
  findMatches,
  formatBlockRate,
  hashText,
  KeywordLimits,
} from '../../src/shared/keywords.js';

describe('normalizeKeyword', () => {
  test('trims surrounding whitespace', () => {
    expect(normalizeKeyword('  詐騙 ')).toBe('詐騙');
  });

  test('rejects empty and whitespace-only input', () => {
    expect(normalizeKeyword('')).toBeNull();
    expect(normalizeKeyword('   ')).toBeNull();
    expect(normalizeKeyword(undefined)).toBeNull();
  });

  test('enforces the length limit', () => {
    expect(normalizeKeyword('a'.repeat(KeywordLimits.MAX_LENGTH))).toHaveLength(30);
    expect(normalizeKeyword('a'.repeat(KeywordLimits.MAX_LENGTH + 1))).toBeNull();
  });
});

describe('isDuplicate', () => {
  test('compares case-insensitively', () => {
    expect(isDuplicate('LINE', [{ text: 'line' }])).toBe(true);
    expect(isDuplicate('lin', [{ text: 'line' }])).toBe(false);
  });
});

describe('findMatches', () => {
  test('finds every occurrence', () => {
    expect(findMatches('詐騙？真的是詐騙', [{ id: 'a', text: '詐騙' }])).toEqual([
      { start: 0, end: 2, keywordId: 'a' },
      { start: 6, end: 8, keywordId: 'a' },
    ]);
  });

  test('matches case-insensitively at the original offsets', () => {
    expect(findMatches('加 LINE 吧', [{ id: 'l', text: 'line' }])).toEqual([
      { start: 2, end: 6, keywordId: 'l' },
    ]);
  });

  test('reports overlapping keywords separately, sorted by start', () => {
    const keywords = [
      { id: 'b', text: '集團' },
      { id: 'a', text: '詐騙集團' },
    ];
    expect(findMatches('詐騙集團', keywords)).toEqual([
      { start: 0, end: 4, keywordId: 'a' },
      { start: 2, end: 4, keywordId: 'b' },
    ]);
  });

  test('counts offsets in UTF-16 code units like DOM Ranges', () => {
    expect(findMatches('🔥飆股🔥', [{ id: 's', text: '飆股' }])).toEqual([
      { start: 2, end: 4, keywordId: 's' },
    ]);
  });

  test('keeps offsets when lowercasing would change string length', () => {
    // 'İ'.toLowerCase() is two code units
    expect(findMatches('İline', [{ id: 'l', text: 'line' }])).toEqual([
      { start: 1, end: 5, keywordId: 'l' },
    ]);
  });

  test('returns nothing without keywords', () => {
    expect(findMatches('任何內容', [])).toEqual([]);
  });
});

describe('formatBlockRate', () => {
  test('hides the rate below the sample threshold', () => {
    expect(formatBlockRate({ hits: 9, blocked: 9 })).toBe('—');
    expect(formatBlockRate(undefined)).toBe('—');
  });

  test('rounds to a whole percent', () => {
    expect(formatBlockRate({ hits: 10, blocked: 3 })).toBe('30%');
    expect(formatBlockRate({ hits: 30, blocked: 1 })).toBe('3%');
  });
});

describe('hashText', () => {
  test('is stable and input-sensitive', () => {
    expect(hashText('這是詐騙')).toBe(hashText('這是詐騙'));
    expect(hashText('這是詐騙')).not.toBe(hashText('這不是詐騙'));
    expect(hashText('x')).toMatch(/^[0-9a-z]+$/);
  });
});
