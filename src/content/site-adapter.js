/**
 * Site adapter for Threads.com
 * Centralizes all Threads-specific DOM knowledge.
 */

import { escapeRegex } from '../shared/utils.js';

const USERNAME_PATTERN = /^\/@([a-zA-Z0-9_.]+)$/;

// Bare username text (no /@ prefix) — used for dialog user-list rows
// where the username exists only as a text node.
const USERNAME_TEXT_PATTERN = /^[a-zA-Z0-9_.]+$/;

// Whitelist of pathnames where extension UI (FAB / block mode) is shown.
// Anything not matching is treated as an unsupported page (e.g. /insights,
// /messages/*, /settings/*).
const SUPPORTED_PATH_PATTERNS = [
  /^\/$/, // home / feed
  /^\/@[^/]+(\/.*)?$/, // profile and post detail under a user
  /^\/saved\/?$/,
  /^\/following(\/.*)?$/,
  /^\/ghost_posts\/?$/,
  /^\/liked\/?$/,
  /^\/search(\/.*)?$/, // search page (with sub-tabs)
];

// Media lightbox view — UI is hidden even though path is under /@*
const MEDIA_VIEW_PATTERN = /\/post\/[^/]+\/media/;

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
    const text = link.textContent?.trim();
    if (text === '個人檔案') return true;

    // Image-only links (no text, just <img>) are always avatars
    if (link.querySelector('img') && !text) return true;

    const rect = link.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 40) return true;

    return false;
  },

  /**
   * Check if a link is inside a navigation container (sidebar, nav bar).
   * These should never be treated as comment authors.
   */
  isNavigationLink(link) {
    return !!link.closest('nav, [role="navigation"]');
  },

  /**
   * Check if a link is inside a compose/post area (contains editable elements).
   */
  isComposeAreaLink(link) {
    return !!link.closest('[role="textbox"], [contenteditable="true"], textarea, [data-composer]');
  },

  /**
   * Single gate: should this link be excluded from comment scanning?
   */
  shouldExcludeLink(link) {
    return this.isAvatarLink(link) || this.isNavigationLink(link) || this.isComposeAreaLink(link);
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
   * Find user rows in dialog-based user lists. Verified on the post insights
   * likes list (2026-09-06 debug); any dialog list with the same row shape
   * (avatar img[alt] + anchor-less pressable content) is picked up too.
   *
   * These rows have NO <a href="/@...">: the username exists only as a text
   * node inside a data-pressable-container, plus verbatim inside the avatar
   * img alt (e.g. "user123的大頭貼照"). We cross-validate text candidates
   * against the alt with a character-boundary check, so display names and
   * locale-specific alt suffixes never produce a false username.
   *
   * Threads keeps a hidden 0x0 duplicate of the list in the dialog; zero-rect
   * rows are dropped whenever a visible row exists, or when the dialog
   * already contains processed rows (a mid-session rescan). They are kept
   * only in rect-less test environments, where neither signal is available.
   *
   * @param {Element} root
   * @param {(row: Element) => boolean} isProcessed - rows for which this
   *   returns true are skipped before the (expensive) username extraction;
   *   the scan runs on every mutation batch, so this matters.
   * @returns {Array<{username: string, container: Element, link: null}>}
   */
  findUserListRows(root = document.body, isProcessed = () => false) {
    const candidates = [];
    let sawProcessed = false;

    for (const dialog of root.querySelectorAll('[role="dialog"], dialog')) {
      for (const pressable of dialog.querySelectorAll('[data-pressable-container]')) {
        // Rows with username anchors are handled by the regular comment flow
        if (pressable.querySelector(this.usernameSelector)) continue;

        const found = this._findRowWithAvatar(pressable, dialog);
        if (!found) continue;

        if (isProcessed(found.row)) {
          sawProcessed = true;
          continue;
        }

        const username = this._extractUsernameFromRow(pressable, found.alt);
        if (!username) continue;

        const rect = found.row.getBoundingClientRect();
        candidates.push({
          username,
          container: found.row,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
    }

    const dropZeroRect = candidates.some((c) => c.visible) || sawProcessed;
    const seen = new Set();
    const results = [];
    for (const c of candidates) {
      if (dropZeroRect && !c.visible) continue;
      if (seen.has(c.username)) continue;
      seen.add(c.username);
      results.push({ username: c.username, container: c.container, link: null });
    }
    return results;
  },

  /**
   * Walk up from a pressable content block to the row element — the first
   * ancestor whose subtree contains an avatar img with a non-empty alt (the
   * avatar lives in a sibling subtree of the pressable). Stops at the dialog
   * boundary. Returns the row together with the alt so callers don't re-query.
   *
   * @returns {{row: Element, alt: string}|null}
   */
  _findRowWithAvatar(pressable, dialog) {
    let el = pressable;
    for (let depth = 0; el && depth < 5; depth++) {
      if (el === dialog || el === document.body) return null;
      const alt = el.querySelector('img[alt]')?.getAttribute('alt');
      if (alt) return { row: el, alt };
      el = el.parentElement;
    }
    return null;
  },

  /**
   * Extract the username from a user-list row: text nodes inside the
   * pressable that look like a username AND appear verbatim (with character
   * boundaries) inside the avatar alt. Longest match wins, so a display name
   * that is a substring of the username never shadows it.
   */
  _extractUsernameFromRow(pressable, alt) {
    const walker = document.createTreeWalker(pressable, NodeFilter.SHOW_TEXT);
    let best = null;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text || !USERNAME_TEXT_PATTERN.test(text)) continue;
      const boundary = new RegExp(`(^|[^a-zA-Z0-9_.])${escapeRegex(text)}([^a-zA-Z0-9_.]|$)`);
      if (!boundary.test(alt)) continue;
      if (!best || text.length > best.length) best = text;
    }
    return best;
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
   * Check if the given pathname is in the supported (whitelisted) page set.
   * Pages outside this list (e.g. /insights, /messages, /settings)
   * should hide all extension UI.
   */
  isSupportedPath(pathname) {
    return SUPPORTED_PATH_PATTERNS.some((re) => re.test(pathname));
  },

  /**
   * Check if the given pathname is the media lightbox view.
   * On media view we hide UI to avoid covering the image.
   */
  isMediaPath(pathname) {
    return MEDIA_VIEW_PATTERN.test(pathname);
  },

  /**
   * Should extension UI (FAB / block mode card) be visible on this URL?
   * True only when path is in the whitelist AND not a media lightbox.
   */
  isUIVisibleOnUrl(url = location.href) {
    const pathname = new URL(url, location.origin).pathname;
    return this.isSupportedPath(pathname) && !this.isMediaPath(pathname);
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
