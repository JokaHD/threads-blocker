/**
 * Site adapter for Threads.com
 * Centralizes all Threads-specific DOM knowledge.
 */

const USERNAME_PATTERN = /^\/@([a-zA-Z0-9_.]+)$/;

export const threadsSiteRule = {
  id: 'threads',
  match: /^https:\/\/www\.threads\.com\//,

  // Username link selector
  usernameSelector: 'a[href^="/@"]',
  usernamePattern: USERNAME_PATTERN,

  /**
   * Check if a link is an avatar link (should be ignored).
   * Avatar links: text is "個人檔案" (profile in Chinese), or large square (60x60).
   * Text links: text is the actual username.
   */
  isAvatarLink(link) {
    // Check text content first (works in test environments too)
    const text = link.textContent?.trim();
    if (text === '個人檔案') return true;

    // Fallback: check dimensions (avatar links are ~60x60)
    const rect = link.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 40) return true;

    return false;
  },

  /**
   * Extract username from href.
   * Returns null if not a valid username link.
   */
  extractUsername(href) {
    const match = href?.match(USERNAME_PATTERN);
    return match ? match[1] : null;
  },

  /**
   * Find the comment container from a username link.
   * Priority: data-pressable-container > heuristic (children >= 3, width 300-900)
   */
  findContainer(usernameLink) {
    let el = usernameLink.parentElement;
    let depth = 0;
    let fallbackCandidate = null;
    let childCountCandidate = null;

    while (el && depth < 10) {
      if (el === document.body) break;

      // Priority 1: data-pressable-container (Meta's own attribute)
      if (el.hasAttribute('data-pressable-container')) {
        return el;
      }

      // Track fallback by child count (for test environments where rect is 0)
      if (!childCountCandidate && el.children.length >= 3) {
        childCountCandidate = el;
      }

      // Track fallback by dimensions (for real browser)
      const rect = el.getBoundingClientRect();
      if (!fallbackCandidate && el.children.length >= 3 && rect.width > 300 && rect.width < 900) {
        fallbackCandidate = el;
      }

      el = el.parentElement;
      depth++;
    }

    // Prefer dimension-based candidate, fall back to child count
    return fallbackCandidate || childCountCandidate;
  },

  /**
   * Get the element to observe for mutations.
   */
  getObserveTarget() {
    return document.body;
  },

  /**
   * MutationObserver config.
   */
  observeConfig: {
    childList: true,
    subtree: true,
  },

  /**
   * Detect current theme.
   */
  getTheme() {
    const bgColor = getComputedStyle(document.body).backgroundColor;
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luminance < 0.5 ? 'dark' : 'light';
  },
};

/**
 * Get the site rule for the current page.
 * Returns null if no matching rule found.
 */
export function getSiteRule() {
  if (threadsSiteRule.match.test(location.href)) {
    return threadsSiteRule;
  }
  return null;
}
