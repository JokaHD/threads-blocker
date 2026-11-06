/**
 * Keyword highlight — shared model: storage keys, limits and matching.
 * Pure functions, used by the content script and the service worker.
 */

export const KeywordStorageKey = {
  // Global display switch; separate key so toggling never rewrites the list
  ENABLED: 'keywordHighlightEnabled',
  // Array<{ id, text, enabled, createdAt }>, written by the keyword manager
  KEYWORDS: 'keywords',
  // { since, perKeyword, posts }, written only by the service worker
  STATS: 'keywordStats',
};

export const KeywordLimits = {
  MAX_LENGTH: 30,
  MAX_COUNT: 200,
  // Per-post detail kept for dedup and block attribution; totals survive pruning
  MAX_POSTS: 5000,
  // Below this many posts the block rate is too noisy to show
  MIN_HITS_FOR_RATE: 10,
};

// Name in the CSS.highlights registry, styled by ::highlight(tb-keyword)
export const KEYWORD_HIGHLIGHT_NAME = 'tb-keyword';

/**
 * @returns {string|null} the trimmed keyword, or null when empty or too long
 */
export function normalizeKeyword(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.length > KeywordLimits.MAX_LENGTH) return null;
  return trimmed;
}

export function isDuplicate(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((k) => k.text.toLowerCase() === lower);
}

/**
 * Lowercase without changing the string length, so match offsets still
 * index the original text (a few characters, e.g. 'İ', lowercase to two
 * code units — those are left as-is).
 */
function foldCase(s) {
  const lower = s.toLowerCase();
  if (lower.length === s.length) return lower;
  let out = '';
  for (const ch of s) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

/**
 * Every occurrence of every keyword in `text`, case-insensitive. Offsets are
 * UTF-16 code units of the original string, the same unit DOM Ranges use.
 *
 * @param {string} text
 * @param {Array<{id: string, text: string}>} keywords
 * @returns {Array<{start: number, end: number, keywordId: string}>}
 */
export function findMatches(text, keywords) {
  const haystack = foldCase(text);
  const matches = [];
  for (const { id, text: keyword } of keywords) {
    const needle = foldCase(keyword);
    if (!needle) continue;
    for (
      let i = haystack.indexOf(needle);
      i !== -1;
      i = haystack.indexOf(needle, i + needle.length)
    ) {
      matches.push({ start: i, end: i + needle.length, keywordId: id });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

/** '30%', or '—' while there are too few posts to say anything */
export function formatBlockRate({ hits = 0, blocked = 0 } = {}) {
  if (hits < KeywordLimits.MIN_HITS_FOR_RATE) return '—';
  return `${Math.round((blocked / hits) * 100)}%`;
}

/** Short non-cryptographic hash (djb2) for fallback post keys */
export function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
